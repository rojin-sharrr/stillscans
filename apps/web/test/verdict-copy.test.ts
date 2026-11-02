import type { CheckResult } from "@stillscans/shared";
import { describe, expect, it } from "vitest";
import { checkedAgo, displayUrl, formatDate } from "../src/lib/format";
import { buildResultView, unreadableView } from "../src/lib/verdict-copy";

const QRFY = {
  slug: "qrfy",
  name: "QRFY",
  parent: null,
  rating: "stops",
  policy: "Dynamic codes deactivate when the trial ends.",
  verified: "2026-10-27",
  sourceUrl: null,
  domain: "qrfy.com",
} as const;

function result(overrides: Partial<CheckResult>): CheckResult {
  return {
    id: "id",
    createdAt: 0,
    verdict: "safe",
    codeType: "static",
    input: "https://joescafe.com/menu",
    hops: [{ url: "https://joescafe.com/menu", host: "joescafe.com", status: 200, via: "final" }],
    finalUrl: "https://joescafe.com/menu",
    finalTitle: null,
    reachability: "loads",
    ending: "loaded",
    controlledBy: null,
    provider: null,
    unknownDomain: null,
    threat: "safe",
    ownCode: false,
    ...overrides,
  };
}

const dynamicHops: CheckResult["hops"] = [
  { url: "https://qrfy.com/r/abc", host: "qrfy.com", status: 302, via: "redirect" },
  { url: "https://joescafe.com/menu", host: "joescafe.com", status: 200, via: "final" },
];

describe("buildResultView", () => {
  it("reproduces the design's safe screen", () => {
    const view = buildResultView(result({}));
    expect(view.label).toBe("Still scans");
    expect(view.headline).toBe("This code goes straight to the website. It will keep scanning.");
    expect(view.hops).toEqual([
      { url: "joescafe.com/menu", note: "Printed inside the code · page loads", tone: "green" },
    ]);
    expect(view.facts[2]?.value).toBe("No, as long as joescafe.com/menu stays online.");
    expect(view.bar).toBeUndefined();
  });

  it("reproduces the design's at-risk screen with real values", () => {
    const view = buildResultView(
      result({
        verdict: "risk",
        codeType: "dynamic",
        hops: dynamicHops,
        controlledBy: "qrfy.com",
        provider: QRFY,
      }),
    );
    expect(view.headline).toBe("This code works today, but another company can switch it off.");
    expect(view.body).toContain("every scan passes through qrfy.com before reaching your page");
    expect(view.hops).toEqual([
      { url: "qrfy.com/r/abc", note: "Redirect server · run by QRFY", tone: "amber" },
      { url: "joescafe.com/menu", note: "Your page · loads today", tone: "green" },
    ]);
    expect(view.panel.rows).toEqual([
      { key: "Opens", value: "joescafe.com/menu" },
      { key: "Printed link", value: "stillscans.net/xxxx" },
    ]);
    expect(view.bar?.href).toBe("/create?destination=https%3A%2F%2Fjoescafe.com%2Fmenu");
  });

  it("does not claim a page loads when that wasn't confirmed", () => {
    const view = buildResultView(
      result({
        verdict: "risk",
        codeType: "dynamic",
        hops: dynamicHops,
        controlledBy: "qrfy.com",
        reachability: "unverified",
        ending: "unverified",
      }),
    );
    expect(view.hops.at(-1)?.note).toBe("Your page · we couldn't confirm it loads");
  });

  it("explains an unknown redirect service without guessing who runs it", () => {
    const view = buildResultView(
      result({
        verdict: "risk",
        codeType: "dynamic",
        hops: dynamicHops,
        controlledBy: "r.example-qr.net",
        unknownDomain: "r.example-qr.net",
      }),
    );
    expect(view.facts[1]?.value).toBe(
      "Whoever runs r.example-qr.net. We don't have them on file yet.",
    );
    expect(view.facts[2]?.value).toBe("Unknown. It depends on that service staying active.");
    expect(view.hops[0]?.note).toBe("Redirect server · provider not on file");
  });

  it("only makes the expiry claim the provider's rating supports", () => {
    const expiry = (rating: "keeps" | "limited" | "stops") =>
      buildResultView(
        result({
          verdict: "risk",
          codeType: "dynamic",
          hops: dynamicHops,
          controlledBy: "qrfy.com",
          provider: { ...QRFY, rating },
        }),
      ).facts[2]?.value;
    expect(expiry("stops")).toMatch(/^Yes\./);
    expect(expiry("limited")).toMatch(/^It can be limited\./);
    expect(expiry("keeps")).toMatch(/^Not by their current policy\./);
  });

  it("reproduces the design's stopped-scanning screen", () => {
    const view = buildResultView(
      result({
        verdict: "dead",
        codeType: "dynamic",
        reachability: "gone",
        ending: "not_found",
        hops: [{ url: "https://qrco.de/bf4Y2u", host: "qrco.de", status: 404, via: "final" }],
        finalUrl: "https://qrco.de/bf4Y2u",
        controlledBy: "qrco.de",
        provider: {
          ...QRFY,
          slug: "qr-code-generator-pro",
          name: "QR Code Generator Pro",
          parent: "Bitly",
          domain: "qrco.de",
        },
      }),
    );
    expect(view.headline).toBe("This code has stopped scanning.");
    expect(view.body).toBe(
      "It points to qrco.de, run by QR Code Generator Pro, which no longer forwards scans to a website. Only they can turn it back on.",
    );
    expect(view.facts[1]?.value).toBe("QR Code Generator Pro (part of Bitly)");
    expect(view.hops.at(-1)).toMatchObject({ url: "No destination", tone: "red", plain: true });
    expect(view.panel.secondary?.label).toBe("Cover it with a sticker instead of reprinting");
  });

  it("never sends a dead code's replacement to the dead URL", () => {
    const view = buildResultView(
      result({
        verdict: "dead",
        codeType: "dynamic",
        reachability: "gone",
        ending: "not_found",
        controlledBy: "qrco.de",
      }),
    );
    expect(view.bar?.href).toBe("/create");
  });

  it("does not blame a company for a static code whose page is gone", () => {
    const view = buildResultView(
      result({ verdict: "dead", reachability: "gone", ending: "not_found" }),
    );
    expect(view.body).toContain("no company switched it off");
    expect(view.facts[2]?.value).toBe("Whoever runs joescafe.com. Or replace the code.");
  });

  it("hides http-to-https hops", () => {
    const view = buildResultView(
      result({
        hops: [
          { url: "http://joescafe.com/menu", host: "joescafe.com", status: 301, via: "redirect" },
          { url: "https://joescafe.com/menu", host: "joescafe.com", status: 200, via: "final" },
        ],
      }),
    );
    expect(view.hops).toHaveLength(1);
  });

  it("handles text payloads and our own codes", () => {
    expect(buildResultView(result({ codeType: "text", hops: [] })).headline).toContain("text");
    expect(buildResultView(result({ ownCode: true })).headline).toContain("StillScans code");
  });

  it("surfaces a safety warning", () => {
    const view = buildResultView(result({ threat: "unsafe" }));
    expect(view.facts.at(-1)?.key).toBe("Safety");
  });

  it("offers a paste fallback when a code can't be read", () => {
    const view = unreadableView("unreadable");
    expect(view.headline).toBe("We couldn't read this code.");
    expect(view.panel.primary?.label).toBe("Check link");
  });
});

describe("format", () => {
  it("formats dates and marks unverified ones", () => {
    expect(formatDate("2026-10-28")).toBe("Oct 28, 2026");
    expect(formatDate(null)).toBe("Not yet verified");
  });

  it("strips scheme and trailing slash", () => {
    expect(displayUrl("https://joescafe.com/")).toBe("joescafe.com");
  });

  it("describes check age", () => {
    expect(checkedAgo(0, 30_000)).toBe("just now");
    expect(checkedAgo(0, 120_000)).toBe("2 minutes ago");
    expect(checkedAgo(0, 2 * 86_400_000)).toBe("2 days ago");
  });
});
