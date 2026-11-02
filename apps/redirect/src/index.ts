/**
 * stillscans.net: the one service that must never break, because every printed
 * code depends on it. It reads only from KV, needs no secrets, and logging a scan
 * can never slow down or fail a redirect. Keep it small; changing logic belongs in api.
 */
import { type KvCodeRecord, kvKey, type ScanEvent } from "@stillscans/shared/kv-record";
import { isValidShortCode } from "@stillscans/shared/short-code";
import { render } from "./pages";

export interface Env {
  KV: KVNamespace;
  SCANS: Queue<ScanEvent>;
  HOME_URL: string;
}

/** Edge-cache KV reads; api's writes reach every location within about a minute. */
const KV_CACHE_TTL_SECONDS = 60;

function deviceType(userAgent: string | null): ScanEvent["deviceType"] {
  if (!userAgent) return "unknown";
  return /mobile|android|iphone|ipad/i.test(userAgent) ? "mobile" : "desktop";
}

function isSafeDestination(destination: string): boolean {
  try {
    const { protocol } = new URL(destination);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function logScan(request: Request, shortCode: string, env: Env, ctx: ExecutionContext): void {
  const { country, city } = (request.cf ?? {}) as { country?: string; city?: string };
  const event: ScanEvent = {
    id: crypto.randomUUID(),
    shortCode,
    scannedAt: Date.now(),
    country: country ?? null,
    city: city ?? null,
    deviceType: deviceType(request.headers.get("user-agent")),
  };
  ctx.waitUntil(
    env.SCANS.send(event).catch((error: unknown) => {
      console.error(JSON.stringify({ event: "scan_log_failed", shortCode, error: String(error) }));
    }),
  );
}

async function readRecord(env: Env, shortCode: string) {
  return env.KV.get<KvCodeRecord>(kvKey(shortCode), {
    type: "json",
    cacheTtl: KV_CACHE_TTL_SECONDS,
  });
}

export async function handle(request: Request, env: Env, ctx: ExecutionContext) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  }

  const shortCode = new URL(request.url).pathname.slice(1).toLowerCase();
  if (shortCode === "") return Response.redirect(env.HOME_URL, 302);
  if (shortCode === "robots.txt") {
    return new Response("User-agent: *\nDisallow: /\n", {
      headers: { "content-type": "text/plain" },
    });
  }
  if (!isValidShortCode(shortCode)) return render("unknown", 404, env);

  let record: KvCodeRecord | null;
  try {
    record = await readRecord(env, shortCode);
  } catch (error) {
    console.error(JSON.stringify({ event: "kv_read_failed", shortCode, error: String(error) }));
    return render("unavailable", 503, env);
  }

  if (!record) return render("unknown", 404, env);
  if (record.s === "blocked") return render("blocked", 410, env);
  if (record.s === "paused") return render("paused", 404, env);
  if (!isSafeDestination(record.d)) {
    console.error(JSON.stringify({ event: "bad_kv_record", shortCode }));
    return render("unknown", 404, env);
  }

  if (request.method === "GET") logScan(request, shortCode, env, ctx);
  return new Response(null, {
    status: 302,
    headers: { location: record.d, "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}

export default { fetch: handle } satisfies ExportedHandler<Env>;
