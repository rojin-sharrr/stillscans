import type { CheckHop } from "@stillscans/shared";
import { type DnsResult, isIpLiteral, normalizeUrl } from "@stillscans/url-safety";
import { extractClientRedirect, extractText, extractTitle } from "./html";

/** Limits from the check spec, plus an overall budget so one check cannot run for a minute. */
const MAX_HOPS = 10;
const HOP_TIMEOUT_MS = 5_000;
const TOTAL_BUDGET_MS = 20_000;
const MAX_HTML_BYTES = 128 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/** How the chain ended. Only `gone` outcomes may produce a "stopped scanning" verdict. */
export type TraceOutcome =
  | { kind: "loaded" }
  | { kind: "gone"; reason: "not_found" | "domain_gone" | "redirect_loop" }
  /** We could not tell: timeouts, 5xx, bot blocks. A code must never be called dead on these. */
  | { kind: "unverified"; reason: "http_error" | "network" | "too_many_hops" | "budget" }
  | { kind: "refused"; reason: "blocked_target" };

export interface Trace {
  hops: CheckHop[];
  outcome: TraceOutcome;
  title: string | null;
  text: string;
}

export interface TraceDeps {
  fetch: typeof fetch;
  resolve: (host: string) => Promise<DnsResult>;
  now?: () => number;
}

/** Never awaited: a stalled upstream must not be able to hang a check. */
function discardBody(response: Response): void {
  response.body?.cancel().catch(() => {});
}

async function readHtml(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let html = "";
  let bytes = 0;
  try {
    while (bytes < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return html;
}

async function requestHop(url: string, deps: TraceDeps): Promise<Response> {
  const init = (method: string): RequestInit => ({
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
    headers: { "user-agent": USER_AGENT, accept: "text/html,*/*;q=0.8" },
  });

  let response: Response;
  try {
    response = await deps.fetch(url, init("GET"));
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw error;
    return deps.fetch(url, init("HEAD"));
  }
  if (response.status !== 405 && response.status !== 501) return response;
  discardBody(response);
  return deps.fetch(url, init("HEAD"));
}

function isHtml(response: Response): boolean {
  const type = response.headers.get("content-type");
  return type === null || type.includes("html");
}

function endOfChain(status: number): TraceOutcome {
  if (status >= 200 && status < 300) return { kind: "loaded" };
  if (status === 404 || status === 410) return { kind: "gone", reason: "not_found" };
  return { kind: "unverified", reason: "http_error" };
}

/**
 * Follows a URL by hand so that every hop is recorded and vetted. Automatic
 * redirects would let a public URL bounce the fetch to an internal address.
 */
export async function traceUrl(start: URL, deps: TraceDeps): Promise<Trace> {
  const now = deps.now ?? Date.now;
  const deadline = now() + TOTAL_BUDGET_MS;
  const hops: CheckHop[] = [];
  const seen = new Set<string>();
  let current = start;

  const finish = (outcome: TraceOutcome, title: string | null = null, text = ""): Trace => ({
    hops,
    outcome,
    title,
    text,
  });

  for (let i = 0; i < MAX_HOPS; i++) {
    if (now() > deadline) return finish({ kind: "unverified", reason: "budget" });
    if (seen.has(current.href)) return finish({ kind: "gone", reason: "redirect_loop" });
    seen.add(current.href);

    const hop: CheckHop = { url: current.href, host: current.hostname, status: null, via: "final" };
    hops.push(hop);

    if (!isIpLiteral(current.hostname)) {
      const dns = await deps.resolve(current.hostname);
      if (dns.status === "nxdomain") return finish({ kind: "gone", reason: "domain_gone" });
      if (dns.status === "private") return finish({ kind: "refused", reason: "blocked_target" });
      // On resolver failure, carry on: the fetch itself is the better test, the URL rules
      // above still apply, and Workers have no route to private networks.
    }

    let response: Response;
    try {
      response = await requestHop(current.href, deps);
    } catch {
      return finish({ kind: "unverified", reason: "network" });
    }
    hop.status = response.status;

    let target: string | null = null;
    let via: CheckHop["via"] = "redirect";
    let title: string | null = null;
    let text = "";

    if (response.status >= 300 && response.status < 400) {
      target = response.headers.get("location");
      discardBody(response);
    } else if (response.ok && isHtml(response)) {
      const html = await readHtml(response);
      title = extractTitle(html);
      text = extractText(html);
      const client = extractClientRedirect(html);
      if (client) {
        target = client.target;
        via = client.via;
      }
    } else {
      discardBody(response);
    }

    if (!target) return finish(endOfChain(response.status), title, text);

    let next: URL;
    try {
      next = new URL(target, current);
    } catch {
      return finish(endOfChain(response.status), title, text);
    }
    const vetted = normalizeUrl(next.href);
    if (!vetted.ok) {
      // A non-web target such as an app link ends the chain rather than failing it.
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        return finish(endOfChain(response.status === 200 ? 200 : 502), title, text);
      }
      return finish({ kind: "refused", reason: "blocked_target" });
    }
    hop.via = via;
    current = vetted.url;
  }
  return finish({ kind: "unverified", reason: "too_many_hops" });
}
