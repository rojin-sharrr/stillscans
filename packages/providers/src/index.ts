import type { ProviderRating } from "@stillscans/shared";
import data from "./providers.json";

/**
 * The provider directory. `null` always means "not yet verified" and must render
 * as such: never fill a gap with a guess. This file is reviewed like code, and
 * every policy claim needs a matching entry in `sources` before launch.
 */
export interface Provider {
  slug: string;
  name: string;
  parent: string | null;
  site: string;
  /** Redirect domains printed inside codes, e.g. `qrco.de`. */
  domains: string[];
  free: string | null;
  freeKind: "plan" | "trial" | null;
  trialDays: number | null;
  rating: ProviderRating;
  policy: string;
  scanLimit: string | null;
  branding: string | null;
  customDomain: boolean | null;
  customDomainPlan: string | null;
  /** ISO date, or null when unverified. */
  verified: string | null;
  /** Provider's own page per field, e.g. `{ "policy": "https://..." }`. */
  sources: Partial<Record<ProviderField, string>>;
  /** Substrings that identify this provider's "deactivated" page. */
  fingerprints: { url: string[]; text: string[] };
}

export type ProviderField =
  | "policy"
  | "domains"
  | "parent"
  | "free"
  | "trial"
  | "scanLimit"
  | "branding"
  | "customDomain";

export const providers = data as Provider[];

export interface ProviderMatch {
  provider: Provider;
  /** The configured domain that matched. */
  domain: string;
  /** `redirect` is a printed redirect domain; `site` is the provider's own website. */
  via: "redirect" | "site";
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

const byRedirectDomain = providers.flatMap((provider) =>
  provider.domains.map((domain) => ({ provider, domain })),
);

/** Matches a host to a provider, preferring printed redirect domains over websites. */
export function matchProvider(rawHost: string): ProviderMatch | null {
  const host = rawHost
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");

  const redirect = byRedirectDomain.find(({ domain }) => hostMatches(host, domain));
  if (redirect) return { ...redirect, via: "redirect" };

  const site = providers.find((provider) => hostMatches(host, provider.site));
  return site ? { provider: site, domain: site.site, via: "site" } : null;
}

export function getProvider(slug: string): Provider | undefined {
  return providers.find((provider) => provider.slug === slug);
}

export const RATINGS: Record<ProviderRating, { label: string; order: number; glyph: string }> = {
  keeps: { label: "Keeps working", order: 0, glyph: "✓" },
  limited: { label: "Limited", order: 1, glyph: "!" },
  stops: { label: "Stops working", order: 2, glyph: "✕" },
  unknown: { label: "Unknown", order: 3, glyph: "?" },
};
