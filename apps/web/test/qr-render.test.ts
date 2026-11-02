import { DEFAULT_QR_DESIGN } from "@stillscans/shared";
import { describe, expect, it } from "vitest";
import { axisMax, placeName, timeAgo } from "../src/lib/analytics-copy";
import { contrastRatio, designWarning } from "../src/lib/qr-design";
import { renderQrSvg } from "../src/lib/qr-render";

const LINK = "https://stillscans.net/x7k2mn";

describe("renderQrSvg", () => {
  it("renders standalone artwork", () => {
    const svg = renderQrSvg(LINK, DEFAULT_QR_DESIGN);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain(`fill="${DEFAULT_QR_DESIGN.foreground}"`);
  });

  it("escapes call-to-action text", () => {
    const svg = renderQrSvg(LINK, {
      ...DEFAULT_QR_DESIGN,
      frame: "label",
      callToAction: '<script>"&',
    });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;&quot;&amp;");
  });

  it("leaves room for the frame", () => {
    const plain = renderQrSvg(LINK, DEFAULT_QR_DESIGN);
    const framed = renderQrSvg(LINK, {
      ...DEFAULT_QR_DESIGN,
      frame: "label",
      callToAction: "Scan",
    });
    const box = (svg: string) =>
      svg
        .match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
        ?.slice(1)
        .map(Number);
    const [plainWidth = 0, plainHeight = 0] = box(plain) ?? [];
    const [framedWidth = 0, framedHeight = 0] = box(framed) ?? [];
    expect(plainHeight).toBe(plainWidth);
    expect(framedHeight).toBeGreaterThan(framedWidth);
  });

  it("uses more error correction when a logo covers data", () => {
    const logo = "data:image/png;base64,iVBORw0KGgo=";
    const plain = renderQrSvg(LINK, DEFAULT_QR_DESIGN);
    const withLogo = renderQrSvg(LINK, { ...DEFAULT_QR_DESIGN, logo });
    expect(withLogo).toContain(logo);
    expect(withLogo.match(/viewBox="0 0 (\d+)/)?.[1]).not.toBe(
      plain.match(/viewBox="0 0 (\d+)/)?.[1],
    );
  });
});

describe("design rules", () => {
  it("measures contrast", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21);
  });

  it("accepts dark on light", () => {
    expect(designWarning(DEFAULT_QR_DESIGN)).toBeNull();
  });

  it("warns on inverted and low-contrast colors", () => {
    expect(
      designWarning({ ...DEFAULT_QR_DESIGN, foreground: "#FFFFFF", background: "#000000" }),
    ).toMatch(/darker/);
    expect(
      designWarning({ ...DEFAULT_QR_DESIGN, foreground: "#BBBBBB", background: "#FFFFFF" }),
    ).toMatch(/too close/);
  });
});

describe("analytics copy", () => {
  it("names places from the most specific data available", () => {
    expect(placeName({ city: "Austin", region: "Texas", country: "US" })).toBe("Austin, Texas");
    expect(placeName({ city: null, region: null, country: "CA" })).toBe("Canada");
    expect(placeName({ city: null, region: null, country: null })).toBe("Unknown");
  });

  it("uses whole, clean axis steps", () => {
    expect(axisMax(0)).toEqual({ max: 4, step: 1 });
    expect(axisMax(3)).toEqual({ max: 4, step: 1 });
    expect(axisMax(7)).toEqual({ max: 10, step: 5 });
    expect(axisMax(180)).toEqual({ max: 200, step: 50 });
    expect(axisMax(1234).max).toBeGreaterThanOrEqual(1234);
  });

  it("describes recent times", () => {
    expect(timeAgo(0, 10_000)).toBe("Just now");
    expect(timeAgo(0, 5 * 60_000)).toBe("5 min ago");
    expect(timeAgo(0, 26 * 3_600_000)).toBe("Yesterday");
  });
});
