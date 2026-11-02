import type { CheckEvent, CheckRequest, CheckResult } from "@stillscans/shared";
import { normalizeUrl, siteHost, type ThreatChecker } from "@stillscans/url-safety";
import { classify } from "./classify";
import { type TraceDeps, traceUrl } from "./trace";

export interface CheckDeps extends TraceDeps {
  threats: ThreatChecker;
}

/** The target must not be fetched. */
export class UncheckableUrlError extends Error {}

/**
 * The first hop never answered, so we know nothing about this code. Reporting any
 * verdict would be a guess, and "Still scans" here could wrongly reassure someone.
 */
export class CheckIncompleteError extends Error {}

type Emit = (event: CheckEvent) => void;

const URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const BARE_DOMAIN = /^[^\s/]+\.[a-z]{2,}(\/\S*)?$/i;

/** QR payloads are often not links: Wi-Fi details, contact cards, plain text. */
function isUrlPayload(text: string): boolean {
  const trimmed = text.trim();
  if (/^https?:\/\//i.test(trimmed)) return true;
  return !URI_SCHEME.test(trimmed) && BARE_DOMAIN.test(trimmed);
}

function inputText(request: CheckRequest): string {
  return "url" in request ? request.url : request.decodedText;
}

/** Shows a URL the way the results screen does: no scheme, no trailing slash. */
function displayUrl(url: URL | string): string {
  return String(url)
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

function textResult(id: string, input: string, now: number): CheckResult {
  return {
    id,
    createdAt: now,
    verdict: "safe",
    codeType: "text",
    input,
    hops: [],
    finalUrl: null,
    finalTitle: null,
    reachability: "loads",
    ending: "loaded",
    controlledBy: null,
    provider: null,
    unknownDomain: null,
    threat: "safe",
    ownCode: false,
  };
}

/**
 * Runs the three steps shown on the checking screen and reports each one as it
 * really happens. Throws when no honest verdict is possible.
 */
export async function runCheck(
  id: string,
  request: CheckRequest,
  deps: CheckDeps,
  emit: Emit,
): Promise<CheckResult> {
  const now = (deps.now ?? Date.now)();
  const input = inputText(request).trim();

  emit({ type: "step", step: "reading", state: "active", detail: null });
  if ("decodedText" in request && !isUrlPayload(input)) {
    emit({
      type: "step",
      step: "reading",
      state: "done",
      detail: "This code holds text, not a link",
    });
    return textResult(id, input, now);
  }
  const normalized = normalizeUrl(input);
  if (!normalized.ok) throw new UncheckableUrlError(normalized.reason);
  const start = normalized.url;
  emit({ type: "step", step: "reading", state: "done", detail: `Found ${displayUrl(start)}` });

  emit({ type: "step", step: "following", state: "active", detail: displayUrl(start) });
  const trace = await traceUrl(start, deps);
  if (trace.outcome.kind === "refused") throw new UncheckableUrlError(trace.outcome.reason);
  if (trace.outcome.kind === "unverified" && trace.hops[0]?.status === null) {
    throw new CheckIncompleteError(trace.outcome.reason);
  }
  const path = trace.hops.map((hop) => displayUrl(hop.url)).join(" → ");
  emit({ type: "step", step: "following", state: "done", detail: path });

  emit({ type: "step", step: "controls", state: "active", detail: null });
  const classification = classify(trace);
  const finalUrl = trace.hops.at(-1)?.url ?? start.href;
  const verdict = await deps.threats.check(finalUrl);
  const threat = verdict === "unchecked" ? "unknown" : verdict;
  const controller = classification.provider?.name ?? classification.controlledBy;
  emit({
    type: "step",
    step: "controls",
    state: "done",
    detail: controller ? `${controller} runs the redirect` : `${siteHost(start.hostname)} directly`,
  });

  return {
    id,
    createdAt: now,
    input,
    hops: trace.hops,
    finalUrl,
    finalTitle: trace.title,
    threat,
    ...classification,
  };
}
