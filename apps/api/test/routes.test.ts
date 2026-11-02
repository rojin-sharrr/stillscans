import type { CheckEvent, CheckResult, KvCodeRecord, ScanEvent } from "@stillscans/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { runMaintenance } from "../src/jobs/maintenance";
import { consumeScans } from "../src/jobs/scans";
import { call, createTestApp, createTestBindings, createTestEnv, seedUser } from "./helpers";

const TIMEOUT_MS = 30_000;

let bindings: Awaited<ReturnType<typeof createTestBindings>>;
let env: Env;
let token: string;

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html" } });

const CLEAR = [
  "scans",
  "code_destinations",
  "codes",
  "sessions",
  "users",
  "checks",
  "provider_reports",
  "unknown_domains",
];

beforeAll(async () => {
  bindings = await createTestBindings();
}, TIMEOUT_MS);

afterAll(() => bindings.mf.dispose());

beforeEach(async () => {
  await bindings.DB.batch(CLEAR.map((table) => bindings.DB.prepare(`DELETE FROM ${table}`)));
  env = createTestEnv(bindings);
  token = await seedUser(bindings.DB, "u1");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/check", () => {
  const routes = () => ({
    "https://qrco.de/abc": new Response(null, {
      status: 302,
      headers: { location: "https://joescafe.com/menu" },
    }),
    "https://joescafe.com/menu": html("<title>Menu</title>"),
  });

  it("returns a result that can be read back by id", async () => {
    const { app } = createTestApp(routes());
    const res = await call(app, env, "/api/check", {
      method: "POST",
      json: { url: "qrco.de/abc" },
    });
    expect(res.status).toBe(200);
    const result = (await res.json()) as CheckResult;
    expect(result).toMatchObject({ verdict: "risk", provider: { slug: "qr-code-generator-pro" } });

    const again = await call(app, env, `/api/check/${result.id}`);
    expect(again.status).toBe(200);
    expect(again.headers.get("x-robots-tag")).toBe("noindex");
    expect(await again.json()).toEqual(result);
  });

  it("streams real progress, ending in the result", async () => {
    const { app } = createTestApp(routes());
    const res = await call(app, env, "/api/check", {
      method: "POST",
      json: { url: "qrco.de/abc" },
      headers: { accept: "application/x-ndjson" },
    });
    expect(res.headers.get("content-type")).toBe("application/x-ndjson");
    const events = (await res.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as CheckEvent);
    expect(events.filter((e) => e.type === "step")).toHaveLength(6);
    expect(events.at(-1)).toMatchObject({ type: "result", result: { verdict: "risk" } });
  });

  it("serves repeats from cache under a new private id", async () => {
    const { app, fetcher } = createTestApp(routes());
    const json = { url: "qrco.de/abc" };
    const first = (await (
      await call(app, env, "/api/check", { method: "POST", json })
    ).json()) as CheckResult;
    const calls = fetcher.mock.calls.length;
    const second = (await (
      await call(app, env, "/api/check", { method: "POST", json })
    ).json()) as CheckResult;
    expect(fetcher.mock.calls.length).toBe(calls);
    expect(second.id).not.toBe(first.id);
    expect(second.verdict).toBe(first.verdict);
  });

  it("logs unknown redirect domains for research, counting repeats", async () => {
    const { app } = createTestApp({
      "https://r.example-qr.net/1": new Response(null, {
        status: 302,
        headers: { location: "https://a.com/" },
      }),
      "https://r.example-qr.net/2": new Response(null, {
        status: 302,
        headers: { location: "https://a.com/" },
      }),
      "https://a.com/": html("ok"),
    });
    await call(app, env, "/api/check", { method: "POST", json: { url: "r.example-qr.net/1" } });
    await call(app, env, "/api/check", { method: "POST", json: { url: "r.example-qr.net/2" } });
    const row = await bindings.DB.prepare("SELECT * FROM unknown_domains").first();
    expect(row).toMatchObject({ domain: "r.example-qr.net", count: 2 });
  });

  it("refuses internal URLs", async () => {
    const { app, fetcher } = createTestApp();
    const res = await call(app, env, "/api/check", {
      method: "POST",
      json: { url: "http://169.254.169.254/" },
    });
    expect(res.status).toBe(422);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not store a result when the link can't be reached", async () => {
    const { app } = createTestApp();
    const res = await call(app, env, "/api/check", {
      method: "POST",
      json: { url: "https://unreachable.example/" },
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: "check_incomplete" } });
    expect(await bindings.DB.prepare("SELECT id FROM checks").first()).toBeNull();
  });

  it("rejects malformed bodies", async () => {
    const { app } = createTestApp();
    const res = await call(app, env, "/api/check", { method: "POST", body: "nope" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "invalid_request" } });
  });

  it("enforces the rate limit per client", async () => {
    vi.mocked(env.CHECK_LIMITER.limit).mockResolvedValueOnce({ success: false });
    const { app } = createTestApp();
    const res = await call(app, env, "/api/check", {
      method: "POST",
      json: { url: "a.com" },
      headers: { "cf-connecting-ip": "203.0.113.9" },
    });
    expect(res.status).toBe(429);
    expect(env.CHECK_LIMITER.limit).toHaveBeenCalledWith({ key: "203.0.113.9" });
  });

  it("404s for an unknown result", async () => {
    const { app } = createTestApp();
    expect((await call(app, env, "/api/check/nope")).status).toBe(404);
  });
});

describe("codes", () => {
  const create = async (destination = "https://joescafe.com/menu", app = createTestApp().app) => {
    const res = await call(app, env, "/api/codes", {
      method: "POST",
      token,
      json: { destination },
    });
    const body = (await res.json()) as {
      code: { id: string; shortCode: string; printedLink: string };
    };
    return { res, code: body.code };
  };
  const readKv = async (shortCode: string) =>
    (await bindings.KV.get(`code:${shortCode}`, "json")) as KvCodeRecord | null;

  it("requires a session", async () => {
    const { app } = createTestApp();
    const res = await call(app, env, "/api/codes", {
      method: "POST",
      json: { destination: "a.com" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects expired sessions", async () => {
    await bindings.DB.prepare("UPDATE sessions SET expires_at = 1").run();
    const { app } = createTestApp();
    expect((await call(app, env, "/api/codes", { token })).status).toBe(401);
  });

  it("creates a code in D1 and copies it to KV", async () => {
    const { res, code } = await create();
    expect(res.status).toBe(201);
    expect(code.printedLink).toBe(`stillscans.net/${code.shortCode}`);
    expect(await readKv(code.shortCode)).toEqual({ d: "https://joescafe.com/menu", s: "active" });
  });

  it("does not expose internals", async () => {
    const { code } = await create();
    expect(Object.keys(code)).not.toContain("userId");
    expect(Object.keys(code)).not.toContain("version");
  });

  it.each([
    ["javascript:alert(1)", "invalid_destination"],
    ["http://10.0.0.1/", "invalid_destination"],
    ["https://stillscans.net/abcd", "invalid_destination"],
    ["https://www.usestillscans.com/", "invalid_destination"],
  ])("rejects destination %s", async (destination, code) => {
    const { app } = createTestApp();
    const res = await call(app, env, "/api/codes", {
      method: "POST",
      token,
      json: { destination },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { code } });
  });

  it("rejects unsafe destinations", async () => {
    const { app } = createTestApp({}, "unsafe");
    const res = await call(app, env, "/api/codes", {
      method: "POST",
      token,
      json: { destination: "a.com" },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { code: "unsafe_destination" } });
  });

  it("fails closed when the safety lookup is down", async () => {
    const { app } = createTestApp({}, "unknown");
    const res = await call(app, env, "/api/codes", {
      method: "POST",
      token,
      json: { destination: "a.com" },
    });
    expect(res.status).toBe(503);
  });

  it("enforces the free allowance of 3, freeing a slot on archive", async () => {
    const { app } = createTestApp();
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await create(`https://a.com/${i}`, app)).code);
    const fourth = await call(app, env, "/api/codes", {
      method: "POST",
      token,
      json: { destination: "a.com" },
    });
    expect(fourth.status).toBe(403);
    expect(await fourth.json()).toMatchObject({ error: { code: "code_limit_reached" } });

    await call(app, env, `/api/codes/${codes[0]?.id}`, { method: "DELETE", token });
    expect((await create("https://a.com/new", app)).res.status).toBe(201);
  });

  it("edits a destination, updating KV and history", async () => {
    const { app } = createTestApp();
    const { code } = await create("https://a.com/old", app);
    const res = await call(app, env, `/api/codes/${code.id}`, {
      method: "PATCH",
      token,
      json: { destination: "https://a.com/new" },
    });
    expect(res.status).toBe(200);
    expect((await readKv(code.shortCode))?.d).toBe("https://a.com/new");

    const detail = (await (await call(app, env, `/api/codes/${code.id}`, { token })).json()) as {
      destinations: { destination: string }[];
    };
    expect(detail.destinations.map((d) => d.destination).sort()).toEqual([
      "https://a.com/new",
      "https://a.com/old",
    ]);
  });

  it("a label-only edit does not touch history or KV", async () => {
    const { app } = createTestApp();
    const { code } = await create("https://a.com/", app);
    vi.mocked(env.KV.put).mockClear();
    await call(app, env, `/api/codes/${code.id}`, {
      method: "PATCH",
      token,
      json: { label: "Menu" },
    });
    expect(env.KV.put).not.toHaveBeenCalled();
  });

  it("keeps other users' codes invisible", async () => {
    const { app } = createTestApp();
    const { code } = await create();
    const other = await seedUser(bindings.DB, "u2");
    expect((await call(app, env, `/api/codes/${code.id}`, { token: other })).status).toBe(404);
    const patched = await call(app, env, `/api/codes/${code.id}`, {
      method: "PATCH",
      token: other,
      json: { label: "x" },
    });
    expect(patched.status).toBe(404);
    expect(
      (await call(app, env, `/api/codes/${code.id}`, { method: "DELETE", token: other })).status,
    ).toBe(404);
  });

  it("archiving pauses the printed link and keeps the short code reserved", async () => {
    const { app } = createTestApp();
    const { code } = await create();
    expect(
      (await call(app, env, `/api/codes/${code.id}`, { method: "DELETE", token })).status,
    ).toBe(204);
    expect((await readKv(code.shortCode))?.s).toBe("paused");
    const row = await bindings.DB.prepare("SELECT status FROM codes WHERE id = ?")
      .bind(code.id)
      .first();
    expect(row).toMatchObject({ status: "archived" });
  });

  it("exports archived codes too", async () => {
    const { app } = createTestApp();
    const { code } = await create();
    await call(app, env, `/api/codes/${code.id}`, { method: "DELETE", token });
    const list = (await (await call(app, env, "/api/codes", { token })).json()) as {
      codes: unknown[];
    };
    expect(list.codes).toHaveLength(0);
    const exported = (await (await call(app, env, "/api/codes/export", { token })).json()) as {
      codes: unknown[];
    };
    expect(exported.codes).toHaveLength(1);
  });

  it("recovers from a failed KV write on the next maintenance run", async () => {
    vi.mocked(env.KV.put).mockRejectedValueOnce(new Error("kv down"));
    const { res, code } = await create();
    expect(res.status).toBe(201);
    expect(await readKv(code.shortCode)).toBeNull();

    await runMaintenance(env);
    expect(await readKv(code.shortCode)).toEqual({ d: "https://joescafe.com/menu", s: "active" });
  });
});

describe("reports", () => {
  it("stores a report", async () => {
    const { app } = createTestApp();
    const res = await call(app, env, "/api/reports", {
      method: "POST",
      json: { providerSlug: "qrfy", message: "Their trial is now 7 days." },
    });
    expect(res.status).toBe(201);
    expect(await bindings.DB.prepare("SELECT * FROM provider_reports").first()).toMatchObject({
      provider_slug: "qrfy",
      status: "open",
    });
  });

  it("rejects unknown providers and empty messages", async () => {
    const { app } = createTestApp();
    const unknown = await call(app, env, "/api/reports", {
      method: "POST",
      json: { providerSlug: "nope", message: "x" },
    });
    expect(unknown.status).toBe(422);
    const empty = await call(app, env, "/api/reports", { method: "POST", json: { message: "" } });
    expect(empty.status).toBe(400);
  });
});

describe("background jobs", () => {
  const scan = (id: string, shortCode = "x7k2"): ScanEvent => ({
    id,
    shortCode,
    scannedAt: Date.now(),
    country: "US",
    city: "Austin",
    deviceType: "mobile",
  });
  const batch = (events: ScanEvent[]) =>
    ({ messages: events.map((body) => ({ body })) }) as unknown as MessageBatch<ScanEvent>;

  it("stores scans, ignoring redelivered messages", async () => {
    await consumeScans(batch([scan("a"), scan("b")]), env);
    await consumeScans(batch([scan("a")]), env);
    const row = await bindings.DB.prepare("SELECT count(*) AS n FROM scans").first();
    expect(row).toMatchObject({ n: 2 });
  });

  it("deletes checks after 30 days", async () => {
    const now = Date.now();
    const day = 86_400_000;
    await bindings.DB.batch([
      bindings.DB.prepare("INSERT INTO checks VALUES ('old', 'h', '{}', ?)").bind(now - 31 * day),
      bindings.DB.prepare("INSERT INTO checks VALUES ('new', 'h', '{}', ?)").bind(now - day),
    ]);
    await runMaintenance(env, now);
    const { results } = await bindings.DB.prepare("SELECT id FROM checks").all();
    expect(results).toEqual([{ id: "new" }]);
  });

  it("reports scan stats to the code's owner", async () => {
    const { app } = createTestApp();
    const res = await call(app, env, "/api/codes", {
      method: "POST",
      token,
      json: { destination: "https://a.com/" },
    });
    const { code } = (await res.json()) as { code: { id: string; shortCode: string } };
    await consumeScans(batch([scan("a", code.shortCode), scan("b", code.shortCode)]), env);
    const stats = (await (
      await call(app, env, `/api/codes/${code.id}/stats`, { token })
    ).json()) as {
      byDevice: unknown[];
      byCity: unknown[];
    };
    expect(stats.byDevice).toEqual([{ deviceType: "mobile", count: 2 }]);
    expect(stats.byCity).toEqual([{ city: "Austin", country: "US", count: 2 }]);
  });
});

describe("http surface", () => {
  it("allows only the web origin through CORS", async () => {
    const { app } = createTestApp();
    const allowed = await call(app, env, "/api/check/x", {
      headers: { origin: "https://usestillscans.com" },
    });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://usestillscans.com");
    const denied = await call(app, env, "/api/check/x", {
      headers: { origin: "https://evil.example" },
    });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("hides internal errors but keeps a request id for tracing", async () => {
    const { app } = createTestApp();
    const broken = createTestEnv(bindings, {
      DB: {
        prepare: () => {
          throw new Error("secret detail");
        },
      } as unknown as D1Database,
    });
    const res = await call(app, broken, "/api/check/x", { headers: { "cf-ray": "ray-1" } });
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain("secret detail");
    expect(body).toContain("ray-1");
  });

  it("answers health checks", async () => {
    const { app } = createTestApp();
    expect(await (await call(app, env, "/health")).json()).toEqual({ ok: true });
  });
});
