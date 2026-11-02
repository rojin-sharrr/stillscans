/**
 * Threat lookups sit behind this interface so the vendor can change in one file.
 * `unknown` means the lookup failed: callers decide whether to fail open or closed.
 */
export type ThreatVerdict = "safe" | "unsafe" | "unknown";

export interface ThreatChecker {
  check(url: string): Promise<ThreatVerdict>;
}

const ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find";
const TIMEOUT_MS = 3_000;

export function createSafeBrowsingChecker(
  apiKey: string | undefined,
  fetcher: typeof fetch = fetch,
): ThreatChecker {
  return {
    async check(url) {
      if (!apiKey) return "unknown";
      try {
        const res = await fetcher(ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          body: JSON.stringify({
            client: { clientId: "stillscans", clientVersion: "1.0" },
            threatInfo: {
              threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"],
              platformTypes: ["ANY_PLATFORM"],
              threatEntryTypes: ["URL"],
              threatEntries: [{ url }],
            },
          }),
        });
        if (!res.ok) return "unknown";
        const body = (await res.json()) as { matches?: unknown[] };
        return body.matches?.length ? "unsafe" : "safe";
      } catch {
        return "unknown";
      }
    },
  };
}
