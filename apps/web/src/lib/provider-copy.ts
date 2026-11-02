import type { Provider, ProviderField } from "@stillscans/providers";

/** Words for a provider page. Shared by the page and its FAQPage structured data. */

export function providerAnswer(p: Provider): string {
  const lead = {
    stops: "Yes, dynamic codes do. ",
    keeps: "No. ",
    limited: "They keep working, with limits. ",
    unknown: "We haven't verified this yet. ",
  }[p.rating];
  return p.rating === "unknown"
    ? `${lead}If you have a code from ${p.name}, check it below and we'll show where it points.`
    : `${lead}${p.policy}`;
}

export function providerFaqs(p: Provider) {
  const free = p.free
    ? `They offer: ${p.free.charAt(0).toLowerCase()}${p.free.slice(1)}.`
    : "We haven't verified their free option yet.";
  return [
    { q: `Is ${p.name} free?`, a: free },
    { q: `Do ${p.name} QR codes expire?`, a: providerAnswer(p) },
    {
      q: "What happens to codes I already printed?",
      a: `Static codes keep working regardless. Dynamic codes depend on ${p.name} continuing to redirect them. See the options above.`,
    },
  ];
}

export interface FactRow {
  key: string;
  value: string | null;
  mono?: boolean;
  field: ProviderField;
}

function trialLength(p: Provider): string | null {
  if (p.freeKind === "trial") return p.free;
  return p.freeKind === "plan" ? "No trial. Free plan." : null;
}

function customDomains(p: Provider): string | null {
  if (p.customDomain === null) return null;
  if (!p.customDomain) return "No";
  return p.customDomainPlan ? `Yes, on ${p.customDomainPlan}` : "Yes";
}

export function providerFacts(p: Provider): FactRow[] {
  return [
    {
      key: "Redirect domains",
      value: p.domains.length ? p.domains.join(", ") : null,
      mono: true,
      field: "domains",
    },
    { key: "Parent company", value: p.parent ?? "None listed", field: "parent" },
    { key: "Free option", value: p.free, field: "free" },
    { key: "Trial length", value: trialLength(p), field: "trial" },
    { key: "Scan limits", value: p.scanLimit, field: "scanLimit" },
    { key: "Branding on free codes", value: p.branding, field: "branding" },
    { key: "Custom domains", value: customDomains(p), field: "customDomain" },
  ];
}

export function faqJsonLd(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}
