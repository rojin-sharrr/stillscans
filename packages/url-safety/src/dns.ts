import { isPrivateIp } from "./host";

/**
 * Workers have no DNS API, so names are resolved over DNS-over-HTTPS before
 * fetching. This catches public names that point at private addresses. Workers
 * cannot reach private networks anyway, so a rebinding race has no target; this
 * check is what lets us also distinguish "domain no longer exists" for the verdict.
 */
export type DnsResult =
  | { status: "ok"; addresses: string[] }
  | { status: "private" }
  | { status: "nxdomain" }
  | { status: "error" };

/** Tried in order, so one resolver being down or blocked can't stop every check. */
const DOH_ENDPOINTS = ["https://cloudflare-dns.com/dns-query", "https://dns.google/resolve"];
const DNS_TIMEOUT_MS = 3_000;
const NXDOMAIN = 3;
const RECORD_A = 1;
const RECORD_AAAA = 28;

interface DohResponse {
  Status: number;
  Answer?: { type: number; data: string }[];
}

async function query(endpoint: string, host: string, type: "A" | "AAAA", fetcher: typeof fetch) {
  const url = `${endpoint}?name=${encodeURIComponent(host)}&type=${type}`;
  const res = await fetcher(url, {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(DNS_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`DoH responded ${res.status}`);
  return (await res.json()) as DohResponse;
}

async function resolveVia(endpoint: string, host: string, fetcher: typeof fetch) {
  const [a, aaaa] = await Promise.all([
    query(endpoint, host, "A", fetcher),
    query(endpoint, host, "AAAA", fetcher),
  ]);
  if (a.Status === NXDOMAIN && aaaa.Status === NXDOMAIN) return { status: "nxdomain" } as const;

  const addresses = [...(a.Answer ?? []), ...(aaaa.Answer ?? [])]
    .filter((record) => record.type === RECORD_A || record.type === RECORD_AAAA)
    .map((record) => record.data);

  if (addresses.length === 0) return { status: "nxdomain" } as const;
  return addresses.some(isPrivateIp)
    ? ({ status: "private" } as const)
    : ({ status: "ok", addresses } as const);
}

export async function resolveHost(host: string, fetcher: typeof fetch = fetch): Promise<DnsResult> {
  for (const endpoint of DOH_ENDPOINTS) {
    try {
      return await resolveVia(endpoint, host, fetcher);
    } catch {
      // Try the next resolver.
    }
  }
  return { status: "error" };
}
