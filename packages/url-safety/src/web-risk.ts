/**
 * Threat lookups sit behind this interface so the vendor can change in one file.
 * `unknown` means a lookup failed. `unchecked` means no key is set, so none was tried.
 * Callers decide how to treat each.
 */
export type ThreatVerdict = "safe" | "unsafe" | "unknown" | "unchecked";

export interface ThreatChecker {
  check(url: string): Promise<ThreatVerdict>;
}

const ENDPOINT = "https://webrisk.googleapis.com/v1/uris:search";
const THREAT_TYPES = ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"];
const TIMEOUT_MS = 3_000;

/** Google's commercial threat list. The Safe Browsing API is for non-commercial use. */
export function createWebRiskChecker(
  apiKey: string | undefined,
  fetcher: typeof fetch = fetch,
  onFailure: (detail: Record<string, unknown>) => void = () => {},
): ThreatChecker {
  return {
    async check(url) {
      if (!apiKey) return "unchecked";
      const params = new URLSearchParams({ uri: url });
      for (const threatType of THREAT_TYPES) params.append("threatTypes", threatType);
      try {
        const res = await fetcher(`${ENDPOINT}?${params}`, {
          headers: { "x-goog-api-key": apiKey },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) {
          // Google's error names the cause, such as a disabled API or missing billing.
          const body = (await res.json().catch(() => null)) as {
            error?: { status?: string; message?: string };
          } | null;
          onFailure({
            httpStatus: res.status,
            status: body?.error?.status,
            message: body?.error?.message,
          });
          return "unknown";
        }
        const body = (await res.json()) as { threat?: unknown };
        return body.threat ? "unsafe" : "safe";
      } catch (error) {
        onFailure({ error: String(error) });
        return "unknown";
      }
    },
  };
}
