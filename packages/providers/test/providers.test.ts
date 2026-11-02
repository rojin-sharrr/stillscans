import { describe, expect, it } from "vitest";
import { getProvider, matchProvider, providers, RATINGS } from "../src";

describe("matchProvider", () => {
  it("matches printed redirect domains", () => {
    expect(matchProvider("qrco.de")).toMatchObject({
      provider: { slug: "qr-code-generator-pro" },
      domain: "qrco.de",
      via: "redirect",
    });
    expect(matchProvider("L.EAD.ME")?.provider.slug).toBe("qr-code-generator-pro");
  });

  it("falls back to the provider's website", () => {
    expect(matchProvider("www.qrfy.com")).toMatchObject({
      provider: { slug: "qrfy" },
      via: "site",
    });
  });

  it("prefers the redirect domain when a host is both", () => {
    expect(matchProvider("me-qr.com")?.via).toBe("redirect");
  });

  it("does not match lookalike hosts", () => {
    expect(matchProvider("notqrco.de")).toBeNull();
    expect(matchProvider("joescafe.com")).toBeNull();
  });
});

describe("dataset", () => {
  it("has unique slugs and redirect domains", () => {
    const slugs = providers.map((p) => p.slug);
    const domains = providers.flatMap((p) => p.domains);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(domains).size).toBe(domains.length);
  });

  it("uses known ratings and well-formed dates", () => {
    for (const p of providers) {
      expect(RATINGS[p.rating]).toBeDefined();
      if (p.verified) expect(p.verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("only cites https sources", () => {
    for (const p of providers) {
      for (const url of Object.values(p.sources)) expect(url).toMatch(/^https:\/\//);
    }
  });

  it("stays neutral in tone", () => {
    const text = JSON.stringify(providers).toLowerCase();
    for (const word of ["scam", "trap", "ransom"]) expect(text).not.toContain(word);
  });

  it("can look a provider up by slug", () => {
    expect(getProvider("hovercode")?.domains).toEqual(["scanqr.to"]);
    expect(getProvider("nope")).toBeUndefined();
  });
});
