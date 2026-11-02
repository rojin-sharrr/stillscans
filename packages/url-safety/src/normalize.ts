import { isBlockedHost } from "./host";

export type UrlRejection =
  | "invalid_url"
  | "unsupported_scheme"
  | "has_credentials"
  | "blocked_host"
  | "too_long";

export type NormalizedUrl = { ok: true; url: URL } | { ok: false; reason: UrlRejection };

const MAX_URL_LENGTH = 2048;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const ALLOWED_PORTS = new Set(["", "80", "443"]);

/** Parses user input into a safe http(s) URL. Bare hosts such as `qrco.de/abc` become https. */
export function normalizeUrl(input: string): NormalizedUrl {
  const trimmed = input.trim();
  if (trimmed.length > MAX_URL_LENGTH) return { ok: false, reason: "too_long" };

  // `localhost:8080/x` parses with `localhost:` as its scheme, so treat host:port as bare.
  const looksBare = !HAS_SCHEME.test(trimmed) || /^[^/:]+:\d+(\/|$)/.test(trimmed);
  let url: URL;
  try {
    url = new URL(looksBare ? `https://${trimmed}` : trimmed);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "unsupported_scheme" };
  }
  if (url.username || url.password) return { ok: false, reason: "has_credentials" };
  if (!ALLOWED_PORTS.has(url.port) || isBlockedHost(url.hostname)) {
    return { ok: false, reason: "blocked_host" };
  }
  return { ok: true, url };
}

/** Strips `www.` so `www.a.com` and `a.com` compare as one site. */
export function siteHost(host: string): string {
  return host
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

/** True when two hosts are the same site or one is a subdomain of the other. */
export function isSameSite(a: string, b: string): boolean {
  const x = siteHost(a);
  const y = siteHost(b);
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}
