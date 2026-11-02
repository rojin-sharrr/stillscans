import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ThreatVerdict } from "@stillscans/url-safety";
import { Miniflare } from "miniflare";
import { vi } from "vitest";
import { type AppDeps, createApp } from "../src/app";
import type { CheckDeps } from "../src/checker/pipeline";
import type { Env } from "../src/env";
import { sha256Hex } from "../src/lib/ids";

export type Routes = Record<string, Response>;

interface FakeWorld {
  private?: string[];
  nxdomain?: string[];
  threat?: ThreatVerdict;
}

export function stubFetch(routes: Routes) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    const response = routes[url];
    if (!response) throw new Error(`Test made an unplanned request to ${url}`);
    return response.clone();
  }) as unknown as typeof fetch;
}

export function testCheckDeps(routes: Routes, world: FakeWorld = {}): CheckDeps {
  return {
    fetch: stubFetch(routes),
    resolve: async (host) => {
      if (world.private?.includes(host)) return { status: "private" };
      if (world.nxdomain?.includes(host)) return { status: "nxdomain" };
      return { status: "ok", addresses: ["93.184.216.34"] };
    },
    threats: { check: async () => world.threat ?? "safe" },
  };
}

const MIGRATIONS_DIR = join(import.meta.dirname, "../../../packages/db/migrations");

/** Real D1 and KV running in workerd, with the real migrations applied. */
export async function createTestBindings() {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
    kvNamespaces: ["KV"],
  });
  const DB = await mf.getD1Database("DB");
  const KV = await mf.getKVNamespace("KV");

  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((name: string) => name.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      await DB.prepare(statement).run();
    }
  }
  return { mf, DB, KV };
}

export function createTestEnv(
  bindings: Awaited<ReturnType<typeof createTestBindings>>,
  overrides: Partial<Env> = {},
) {
  const { KV } = bindings;
  return {
    DB: bindings.DB,
    // Miniflare's binding is a proxy that spies can't intercept, so wrap it to inject failures.
    KV: {
      get: (...args: Parameters<KVNamespace["get"]>) => KV.get(...args),
      put: vi.fn((key: string, value: string) => KV.put(key, value)),
    },
    CHECK_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    REPORT_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    ENVIRONMENT: "production",
    WEB_ORIGIN: "https://usestillscans.com",
    ...overrides,
  } as unknown as Env;
}

export function createTestApp(routes: Routes = {}, threat: ThreatVerdict = "safe") {
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://cloudflare-dns.com/")) {
      return Response.json({ Status: 0, Answer: [{ type: 1, data: "93.184.216.34" }] });
    }
    return stubFetch(routes)(input, init);
  }) as unknown as typeof fetch;

  const deps: AppDeps = { fetch: fetcher, threats: () => ({ check: async () => threat }) };
  return { app: createApp(deps), fetcher: vi.mocked(fetcher) };
}

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

export function call(
  app: ReturnType<typeof createApp>,
  env: Env,
  path: string,
  init: RequestInit & { json?: unknown; token?: string } = {},
) {
  const { json, token, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const request = new Request(`https://api.usestillscans.com${path}`, {
    ...rest,
    headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  return app.fetch(request, env, ctx);
}

export async function seedUser(db: D1Database, id: string, allowance = 3) {
  const now = Date.now();
  const token = `token-${id}`;
  await db.batch([
    db
      .prepare("INSERT INTO users (id, email, code_allowance, created_at) VALUES (?, ?, ?, ?)")
      .bind(id, `${id}@example.com`, allowance, now),
    db
      .prepare(
        "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(await sha256Hex(token), id, now + 3_600_000, now),
  ]);
  return token;
}
