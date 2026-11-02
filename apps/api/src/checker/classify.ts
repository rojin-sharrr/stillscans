import { matchProvider, type ProviderMatch } from "@stillscans/providers";
import {
  type ChainEnding,
  type CheckHop,
  type CheckProvider,
  REDIRECT_HOST,
  type Verdict,
} from "@stillscans/shared";
import { isSameSite, siteHost } from "@stillscans/url-safety";
import type { Trace } from "./trace";

/** Applied to dynamic codes, whichever company runs them. */
const DEACTIVATED_PHRASES = [
  "code has been deactivated",
  "code is deactivated",
  "code has expired",
  "code is inactive",
  "qr code is no longer active",
  "qr code expired",
  "this link has expired",
  "trial has expired",
  "trial has ended",
];

/** Applied to every code: a parked domain means the page is gone. */
const PARKED_PHRASES = [
  "this domain is for sale",
  "domain is for sale",
  "buy this domain",
  "domain has expired",
  "parked free",
];

export interface Classification {
  verdict: Verdict;
  codeType: "static" | "dynamic";
  reachability: "loads" | "unverified" | "gone";
  ending: ChainEnding;
  controlledBy: string | null;
  provider: CheckProvider | null;
  unknownDomain: string | null;
  ownCode: boolean;
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle.toLowerCase()));
}

function toCheckProvider({ provider, domain }: ProviderMatch): CheckProvider {
  return {
    slug: provider.slug,
    name: provider.name,
    parent: provider.parent,
    rating: provider.rating,
    policy: provider.policy,
    verified: provider.verified,
    sourceUrl: provider.sources.policy ?? null,
    domain,
  };
}

/** The first hop that belongs to a provider: hop 0 in almost every case. */
function findProviderMatch(hops: CheckHop[], crossesSites: boolean): ProviderMatch | null {
  for (const hop of hops) {
    const match = matchProvider(hop.host);
    // Linking straight to a QR company's website is not a redirect through them.
    if (match && (match.via === "redirect" || crossesSites)) return match;
  }
  return null;
}

/** The chain ended on the provider's own website rather than the owner's page. */
function endsOnProviderSite(match: ProviderMatch, finalHost: string): boolean {
  return isSameSite(finalHost, match.provider.site);
}

function chainEnding(trace: Trace, isDeactivated: boolean, isParked: boolean): ChainEnding {
  if (trace.outcome.kind === "gone") return trace.outcome.reason;
  if (isDeactivated) return "deactivated";
  if (isParked) return "parked";
  return trace.outcome.kind === "loaded" ? "loaded" : "unverified";
}

export function classify(trace: Trace): Classification {
  const first = trace.hops[0];
  const last = trace.hops.at(-1);
  if (!first || !last) throw new Error("A trace always records at least one hop");

  const ownCode = siteHost(first.host) === REDIRECT_HOST;
  const crossesSites = trace.hops.some((hop) => !isSameSite(hop.host, first.host));
  const match = findProviderMatch(trace.hops, crossesSites);
  const dynamic = !ownCode && (crossesSites || match?.via === "redirect");

  const pageText = `${trace.title ?? ""} ${trace.text}`.toLowerCase();
  const finalUrl = last.url.toLowerCase();

  const isParked = includesAny(pageText, PARKED_PHRASES);
  const isDeactivated =
    dynamic &&
    (includesAny(pageText, DEACTIVATED_PHRASES) ||
      (match !== null &&
        (includesAny(pageText, match.provider.fingerprints.text) ||
          includesAny(finalUrl, match.provider.fingerprints.url) ||
          (crossesSites && endsOnProviderSite(match, last.host)))));

  const ending = chainEnding(trace, isDeactivated, isParked);
  const reachability =
    ending === "loaded" ? "loads" : ending === "unverified" ? "unverified" : "gone";

  const provider = match ? toCheckProvider(match) : null;
  const shared = { reachability, ending, ownCode, provider: dynamic ? provider : null } as const;

  if (ownCode) {
    return {
      ...shared,
      verdict: "safe",
      codeType: "dynamic",
      controlledBy: REDIRECT_HOST,
      unknownDomain: null,
    };
  }
  if (!dynamic) {
    return {
      ...shared,
      verdict: reachability === "gone" ? "dead" : "safe",
      codeType: "static",
      controlledBy: null,
      unknownDomain: null,
    };
  }
  return {
    ...shared,
    verdict: reachability === "gone" ? "dead" : "risk",
    codeType: "dynamic",
    controlledBy: siteHost(first.host),
    unknownDomain: provider ? null : siteHost(first.host),
  };
}
