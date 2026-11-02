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
  /** Optional: without it scans still count, but distinct visitors can't be estimated. */
  SCAN_SALT?: string;
}

/** Edge-cache KV reads; api's writes reach every location within about a minute. */
const KV_CACHE_TTL_SECONDS = 60;

/** Not people: counting these would inflate a realtor's numbers. */
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|curl|wget|python|headless/i;

function deviceType(userAgent: string | null): ScanEvent["deviceType"] {
  if (!userAgent) return "unknown";
  return /mobile|android|iphone|ipad/i.test(userAgent) ? "mobile" : "desktop";
}

function operatingSystem(userAgent: string | null): ScanEvent["os"] {
  if (!userAgent) return "other";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  if (/android/i.test(userAgent)) return "android";
  if (/windows/i.test(userAgent)) return "windows";
  return /mac os/i.test(userAgent) ? "mac" : "other";
}

function isHumanScan(request: Request): boolean {
  const userAgent = request.headers.get("user-agent");
  if (userAgent && BOT.test(userAgent)) return false;
  const purpose = request.headers.get("sec-purpose") ?? request.headers.get("purpose");
  return !purpose?.includes("prefetch");
}

/** See ScanEvent.visitorHash. The IP goes into the hash and is never stored or sent. */
async function visitorHash(request: Request, shortCode: string, env: Env, now: number) {
  if (!env.SCAN_SALT) return null;
  const day = new Date(now).toISOString().slice(0, 10);
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  const userAgent = request.headers.get("user-agent") ?? "";
  const input = new TextEncoder().encode(`${env.SCAN_SALT}|${day}|${shortCode}|${ip}|${userAgent}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest).slice(0, 12), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function isSafeDestination(destination: string): boolean {
  try {
    const { protocol } = new URL(destination);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

async function sendScan(request: Request, shortCode: string, env: Env): Promise<void> {
  const { country, region, city } = (request.cf ?? {}) as Record<string, string | undefined>;
  const userAgent = request.headers.get("user-agent");
  const scannedAt = Date.now();
  await env.SCANS.send({
    id: crypto.randomUUID(),
    shortCode,
    scannedAt,
    country: country ?? null,
    region: region ?? null,
    city: city ?? null,
    deviceType: deviceType(userAgent),
    os: operatingSystem(userAgent),
    visitorHash: await visitorHash(request, shortCode, env, scannedAt),
  });
}

function logScan(request: Request, shortCode: string, env: Env, ctx: ExecutionContext): void {
  ctx.waitUntil(
    sendScan(request, shortCode, env).catch((error: unknown) => {
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

  if (request.method === "GET" && isHumanScan(request)) logScan(request, shortCode, env, ctx);
  return new Response(null, {
    status: 302,
    headers: { location: record.d, "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}

export default { fetch: handle } satisfies ExportedHandler<Env>;
