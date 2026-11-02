import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { guides } from "../src/lib/guides";

const page = (name: string) =>
  readFileSync(new URL(`../src/pages/${name}`, import.meta.url), "utf8");

const allCopy = [
  ...["pricing.astro", "trust.astro", "privacy.astro", "terms.astro"].map(page),
  JSON.stringify(guides),
].join("\n");

describe("site copy rules", () => {
  it("never calls the offer a subscription", () => {
    expect(allCopy.toLowerCase()).not.toContain("subscription");
  });

  it("stays neutral about other companies", () => {
    for (const word of ["scam company", "hostage", "ransom", "rip-off"]) {
      expect(allCopy.toLowerCase()).not.toContain(word);
    }
  });

  // Web Risk is off in production. Only reword this after turning it on.
  it("doesn't publish that destinations are checked against unsafe-site lists", () => {
    const trust = page("trust.astro").replace(/<Todo>.*?<\/Todo>/gs, "");
    expect(trust.toLowerCase()).not.toMatch(/unsafe-site lists|checked against/);
  });
});

describe("guides", () => {
  it("covers the four guide URLs", () => {
    expect(guides.map((guide) => guide.slug).sort()).toEqual([
      "do-qr-codes-expire",
      "qr-code-not-scanning",
      "static-vs-dynamic-qr-codes",
      "why-qr-code-stopped-working",
    ]);
  });

  it("gives each one sections, questions and a description", () => {
    for (const guide of guides) {
      expect(guide.sections.length).toBeGreaterThan(1);
      expect(guide.faqs.length).toBeGreaterThanOrEqual(3);
      expect(guide.description.length).toBeGreaterThan(50);
    }
  });

  it("uses unique section anchors", () => {
    for (const guide of guides) {
      const ids = guide.sections.map((section) => section.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
