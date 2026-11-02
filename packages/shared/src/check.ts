/** The checker's wire contract: what api returns and what the results screen renders. */

export type Verdict = "safe" | "risk" | "dead";
export type CodeType = "static" | "dynamic" | "text";
export type PageReachability = "loads" | "unverified" | "gone";
/** Why the chain ended where it did. Drives truthful copy on the results screen. */
export type ChainEnding =
  | "loaded"
  | "unverified"
  | "not_found"
  | "domain_gone"
  | "redirect_loop"
  | "deactivated"
  | "parked";
export type ThreatStatus = "safe" | "unsafe" | "unknown";
export type ProviderRating = "keeps" | "limited" | "stops" | "unknown";

export interface CheckHop {
  url: string;
  host: string;
  status: number | null;
  /** How this hop was left: `final` means the chain ended here. */
  via: "redirect" | "meta-refresh" | "js" | "final";
}

export interface CheckProvider {
  slug: string;
  name: string;
  parent: string | null;
  rating: ProviderRating;
  policy: string;
  verified: string | null;
  sourceUrl: string | null;
  /** The domain in this code that matched the provider. */
  domain: string;
}

export interface CheckResult {
  id: string;
  createdAt: number;
  verdict: Verdict;
  codeType: CodeType;
  /** The decoded payload, as read from the code. */
  input: string;
  hops: CheckHop[];
  finalUrl: string | null;
  finalTitle: string | null;
  reachability: PageReachability;
  ending: ChainEnding;
  /** Host that sits between the scan and the page, for dynamic codes. */
  controlledBy: string | null;
  provider: CheckProvider | null;
  /** Set for a dynamic code whose redirect domain is not in the directory. */
  unknownDomain: string | null;
  threat: ThreatStatus;
  /** True when the code is one of ours (stillscans.net). */
  ownCode: boolean;
}

export type CheckStep = "reading" | "following" | "controls";

export type CheckEvent =
  | { type: "step"; step: CheckStep; state: "active" | "done"; detail: string | null }
  | { type: "result"; result: CheckResult }
  | { type: "error"; code: string; message: string };
