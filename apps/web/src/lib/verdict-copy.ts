import type { CheckProvider, CheckResult } from "@stillscans/shared";
import { displayUrl } from "./format";

/**
 * Turns a check result into the words on the results screen. Copy comes from the
 * design with its example domains replaced by real values. Every sentence must be
 * true of this specific result, so nothing here claims more than the checker found.
 */

export type VerdictKey = "safe" | "risk" | "dead" | "error";
type HopTone = "green" | "amber" | "red";

export interface HopView {
  url: string;
  note: string;
  tone: HopTone;
  /** "No destination" is a statement rather than a link, so it renders in the sans face. */
  plain?: boolean;
}

export interface PanelView {
  title: string;
  body: string;
  rows?: { key: string; value: string }[];
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string; note?: string };
  link?: { label: string; href: string };
  guarantee?: boolean;
}

export interface ResultView {
  verdict: VerdictKey;
  label: string;
  headline: string;
  body: string;
  hops: HopView[];
  facts: { key: string; value: string }[];
  panel: PanelView;
  /** Phone sticky bar. */
  bar?: { label: string; href: string };
}

const LABELS: Record<VerdictKey, string> = {
  safe: "Still scans",
  risk: "At risk",
  dead: "Stopped scanning",
  error: "Couldn't read",
};

const DYNAMIC_TYPE = "Dynamic. Scans pass through another company first.";
const STATIC_TYPE = "Static. The link is inside the code.";

function createHref(destination: string | null, sticker = false): string {
  const params = new URLSearchParams();
  if (destination) params.set("destination", destination);
  if (sticker) params.set("sticker", "1");
  const query = params.toString();
  return query ? `/create?${query}` : "/create";
}

function pageNote(result: CheckResult, prefix: string): string {
  return result.reachability === "loads"
    ? `${prefix} · loads today`
    : `${prefix} · we couldn't confirm it loads`;
}

function controllerName(result: CheckResult): string {
  const { provider } = result;
  if (!provider) return result.controlledBy ?? "another company";
  return provider.parent ? `${provider.name} (part of ${provider.parent})` : provider.name;
}

/** Collapses http→https and www hops, which mean nothing to the reader. */
function visibleHops(result: CheckResult) {
  const seen = new Set<string>();
  return result.hops.filter((hop) => {
    const key = displayUrl(hop.url).replace(/^www\./, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function redirectNote(result: CheckResult, host: string): string {
  const { provider, unknownDomain } = result;
  if (provider) return `Redirect server · run by ${provider.name}`;
  if (unknownDomain) return "Redirect server · provider not on file";
  return `Redirect server · run by ${host.replace(/^www\./, "")}`;
}

function deadEnding(result: CheckResult): HopView {
  const noDestination = { url: "No destination", tone: "red", plain: true } as const;
  const last = result.hops.at(-1);
  switch (result.ending) {
    case "domain_gone":
      return { ...noDestination, note: "The domain no longer exists" };
    case "redirect_loop":
      return { ...noDestination, note: "The link redirects in a loop" };
    case "parked":
      return { ...noDestination, note: "The domain is parked" };
    case "deactivated":
      return {
        ...noDestination,
        note: result.provider
          ? `Leads to a ${result.provider.name} service page`
          : "Leads to a service page",
      };
    default:
      return { ...noDestination, note: `Server replies ${last?.status ?? "with an error"}` };
  }
}

function buildDynamicHops(result: CheckResult): HopView[] {
  const hops = visibleHops(result);

  if (result.verdict === "dead") {
    // The service page itself isn't a destination, so it is replaced by the dead ending.
    const servers = result.ending === "deactivated" ? hops.slice(0, 1) : hops;
    return [
      ...servers.map(
        (hop): HopView => ({
          url: displayUrl(hop.url),
          note: redirectNote(result, hop.host),
          tone: "amber",
        }),
      ),
      deadEnding(result),
    ];
  }

  return hops.map((hop, index): HopView => {
    const isLast = index === hops.length - 1;
    return isLast
      ? { url: displayUrl(hop.url), note: pageNote(result, "Your page"), tone: "green" }
      : { url: displayUrl(hop.url), note: redirectNote(result, hop.host), tone: "amber" };
  });
}

function expiryFact(provider: CheckProvider | null): string {
  if (!provider || provider.rating === "unknown") {
    return "Unknown. It depends on that service staying active.";
  }
  const lead = {
    stops: "Yes.",
    limited: "It can be limited.",
    keeps: "Not by their current policy.",
  };
  return `${lead[provider.rating]} ${provider.policy}`;
}

const guideEditable = { label: "Need an editable code? Make one free.", href: "/create" };

function textView(): ResultView {
  return {
    verdict: "safe",
    label: LABELS.safe,
    headline: "This code holds text, not a link. It will keep scanning.",
    body: "Everything is stored inside the code itself, so no company sits in the middle and nothing can switch it off.",
    hops: [],
    facts: [
      { key: "Type", value: "Static. The content is inside the code." },
      { key: "Controlled by", value: "No one. It can’t be edited or switched off." },
    ],
    panel: {
      title: "Nothing to fix",
      body: "You can keep printing this code. It doesn't depend on any company, including us.",
      link: guideEditable,
    },
  };
}

function ownCodeView(result: CheckResult): ResultView {
  return {
    verdict: "safe",
    label: LABELS.safe,
    headline: "This is a StillScans code. It keeps working, paid or not.",
    body: "If you stop paying, your codes keep working. You only lose editing and analytics.",
    hops: visibleHops(result).map((hop, index, all) =>
      index === all.length - 1
        ? { url: displayUrl(hop.url), note: pageNote(result, "Your page"), tone: "green" }
        : { url: displayUrl(hop.url), note: "StillScans redirect", tone: "green" },
    ),
    facts: [
      { key: "Type", value: "Permanent. Runs on StillScans." },
      { key: "Controlled by", value: "The code's owner." },
      { key: "Can it expire?", value: "No." },
    ],
    panel: {
      title: "Nothing to fix",
      body: "You can keep printing this code.",
      link: guideEditable,
    },
  };
}

function staticSafeView(result: CheckResult): ResultView {
  const hops = visibleHops(result);
  const finalPage = displayUrl(result.finalUrl ?? result.input);
  return {
    verdict: "safe",
    label: LABELS.safe,
    headline: "This code goes straight to the website. It will keep scanning.",
    body: "It's a static code: the link is printed inside the code itself, so no company sits in the middle and nothing can switch it off.",
    hops: hops.map((hop, index) => ({
      url: displayUrl(hop.url),
      note:
        index > 0
          ? "Same website"
          : result.reachability === "loads"
            ? "Printed inside the code · page loads"
            : "Printed inside the code · we couldn't confirm it loads",
      tone: "green",
    })),
    facts: [
      { key: "Type", value: STATIC_TYPE },
      { key: "Controlled by", value: "No one. It can’t be edited or switched off." },
      { key: "Can it expire?", value: `No, as long as ${finalPage} stays online.` },
    ],
    panel: {
      title: "Nothing to fix",
      body: "You can keep printing this code. It doesn't depend on any company, including us.",
      link: guideEditable,
    },
  };
}

function riskView(result: CheckResult): ResultView {
  const { provider, unknownDomain, controlledBy, finalUrl } = result;
  const via = controlledBy ?? "another company";
  const href = createHref(finalUrl);
  const cta = "Make a free permanent code";
  return {
    verdict: "risk",
    label: LABELS.risk,
    headline: "This code works today, but another company can switch it off.",
    body: unknownDomain
      ? `It's a dynamic code: every scan passes through ${via} before reaching your page. If that service stops forwarding, the code stops working.`
      : `It's a dynamic code: every scan passes through ${via} before reaching your page. If they stop forwarding, the code stops working.`,
    hops: buildDynamicHops(result),
    facts: [
      { key: "Type", value: DYNAMIC_TYPE },
      {
        key: "Controlled by",
        value: unknownDomain
          ? `Whoever runs ${via}. We don't have them on file yet.`
          : controllerName(result),
      },
      { key: "Can it expire?", value: expiryFact(provider) },
    ],
    panel: {
      title: "Make a free permanent code for the same link",
      body: "Same page, new code. It keeps working whether or not you ever pay us.",
      rows: [
        { key: "Opens", value: displayUrl(finalUrl ?? result.input) },
        { key: "Printed link", value: "stillscans.net/xxxx" },
      ],
      primary: { label: cta, href },
      guarantee: true,
    },
    bar: { label: cta, href },
  };
}

function deadView(result: CheckResult): ResultView {
  const { provider, controlledBy, codeType } = result;
  const href = createHref(null);
  const cta = "Create a permanent replacement";
  const panel: PanelView = {
    title: cta,
    body: "Point a new code at your page. It runs on StillScans and keeps working, paid or not.",
    primary: { label: cta, href },
    secondary: {
      label: "Cover it with a sticker instead of reprinting",
      href: createHref(null, true),
      note: "Print the new code on a sticker the size of the old one and place it on top.",
    },
    guarantee: true,
  };
  const shared = { verdict: "dead", label: LABELS.dead, panel, bar: { label: cta, href } } as const;

  if (codeType === "static") {
    const site = result.hops[0]?.host.replace(/^www\./, "") ?? "the website";
    return {
      ...shared,
      headline: "This code has stopped scanning.",
      body: `The link is printed inside the code, so no company switched it off, but the page it opens at ${site} is gone.`,
      hops: [
        { url: displayUrl(result.input), note: "Printed inside the code", tone: "amber" },
        deadEnding(result),
      ],
      facts: [
        { key: "Type", value: STATIC_TYPE },
        { key: "Controlled by", value: `Whoever runs ${site}.` },
        { key: "Who can fix it", value: `Whoever runs ${site}. Or replace the code.` },
      ],
    };
  }

  const name = provider?.name ?? controlledBy ?? "that company";
  const via = provider ? `${provider.domain}, run by ${provider.name},` : controlledBy;
  const domainNote = provider?.domain === controlledBy ? via : `${controlledBy},`;
  return {
    ...shared,
    headline: "This code has stopped scanning.",
    body: provider
      ? `It points to ${domainNote} which no longer forwards scans to a website. Only they can turn it back on.`
      : `It points to ${controlledBy}, which no longer forwards scans to a website. Only ${name} can turn it back on.`,
    hops: buildDynamicHops(result),
    facts: [
      { key: "Type", value: DYNAMIC_TYPE },
      { key: "Controlled by", value: controllerName(result) },
      { key: "Who can fix it", value: `Only ${name}. Contact them, or replace the code.` },
    ],
  };
}

function withThreatWarning(view: ResultView, result: CheckResult): ResultView {
  if (result.threat !== "unsafe") return view;
  return {
    ...view,
    facts: [
      ...view.facts,
      {
        key: "Safety",
        value: "Google Safe Browsing lists this page as unsafe. Take care opening it.",
      },
    ],
  };
}

export function buildResultView(result: CheckResult): ResultView {
  if (result.codeType === "text") return textView();
  if (result.ownCode) return withThreatWarning(ownCodeView(result), result);
  const view =
    result.verdict === "risk"
      ? riskView(result)
      : result.verdict === "dead"
        ? deadView(result)
        : staticSafeView(result);
  return withThreatWarning(view, result);
}

/** No result exists for these, so the screen is built without one. */
export function unreadableView(reason: "unreadable" | "uncheckable"): ResultView {
  const panel: PanelView = {
    title: "Have the link instead?",
    body: "Paste it and we'll check it the same way.",
    primary: { label: "Check link", href: "#" },
    secondary: { label: "Try another photo", href: "/" },
  };
  const bar = { label: "Try another photo", href: "/" };
  if (reason === "uncheckable") {
    return {
      verdict: "error",
      label: LABELS.error,
      headline: "We can't check this link.",
      body: "It isn't a public web address, so we won't open it. Check that it was copied correctly.",
      hops: [],
      facts: [],
      panel,
      bar,
    };
  }
  return {
    verdict: "error",
    label: LABELS.error,
    headline: "We couldn't read this code.",
    body: "The photo may be blurry, too dark, or cut off. Try another photo, or paste the link if you can see it.",
    hops: [],
    facts: [],
    panel,
    bar,
  };
}

export const PHOTO_TIPS = [
  "Fill most of the frame with the code.",
  "Use bright, even light and avoid glare.",
  "Hold steady, or upload a sharper photo.",
  "Make sure all three corner squares are visible.",
];
