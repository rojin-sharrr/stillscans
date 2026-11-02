import { DEFAULT_QR_DESIGN } from "@stillscans/shared";
import { describe, expect, it } from "vitest";
import { cleanLogo, type LogoPixels } from "../src/lib/logo-clean";
import { renderQrSvg } from "../src/lib/qr-render";

type Rgba = [number, number, number, number];

function image(width: number, height: number, paint: (x: number, y: number) => Rgba): LogoPixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4);
  }
  return { data, width, height };
}

const alphaAt = ({ data, width }: LogoPixels, x: number, y: number) =>
  data[(y * width + x) * 4 + 3];

const GREY: Rgba = [238, 238, 238, 255];
const BLACK: Rgba = [17, 18, 18, 255];

describe("cleanLogo", () => {
  it("removes a light background and trims to the mark", () => {
    const pixels = image(100, 60, (x, y) =>
      x >= 40 && x < 60 && y >= 25 && y < 35 ? BLACK : GREY,
    );
    const result = cleanLogo(pixels);
    expect(result).toMatchObject({ x: 40, y: 25, width: 20, height: 10, solid: false });
    expect(alphaAt(pixels, 0, 0)).toBe(0);
    expect(alphaAt(pixels, 50, 30)).toBe(255);
  });

  it("keeps light areas inside the logo", () => {
    const ring = (x: number, y: number): Rgba => {
      const distance = Math.hypot(x - 30, y - 30);
      return distance > 10 && distance < 20 ? BLACK : [255, 255, 255, 255];
    };
    const pixels = image(60, 60, ring);
    cleanLogo(pixels);
    expect(alphaAt(pixels, 0, 0)).toBe(0);
    expect(alphaAt(pixels, 30, 30)).toBe(255);
  });

  it("fades edge pixels so curves stay smooth", () => {
    const pixels = image(30, 10, (x) =>
      x < 10 || x >= 20 ? [255, 255, 255, 255] : x === 10 ? [225, 225, 225, 255] : BLACK,
    );
    cleanLogo(pixels);
    const edge = alphaAt(pixels, 10, 5) ?? 0;
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
  });

  it("trims logos that are already transparent", () => {
    const pixels = image(50, 50, (x, y) =>
      x > 20 && x < 30 && y > 20 && y < 30 ? BLACK : [0, 0, 0, 0],
    );
    expect(cleanLogo(pixels)).toMatchObject({ x: 21, y: 21, width: 9, height: 9, solid: false });
  });

  it("keeps a dark background, which a light logo may depend on", () => {
    const pixels = image(40, 40, (x, y) => (x === 20 && y === 20 ? [255, 255, 255, 255] : BLACK));
    expect(cleanLogo(pixels)).toMatchObject({ width: 40, height: 40, solid: true });
    expect(alphaAt(pixels, 0, 0)).toBe(255);
  });

  it("leaves photos with no plain background alone", () => {
    const corners = (x: number, y: number): Rgba =>
      x < 20 ? [200, 30, 30, 255] : y < 20 ? [30, 200, 30, 255] : [30, 30, 200, 255];
    expect(cleanLogo(image(40, 40, corners)).solid).toBe(true);
  });

  it("doesn't crash on a blank image", () => {
    expect(cleanLogo(image(10, 10, () => GREY))).toMatchObject({ width: 10, height: 10 });
  });
});

describe("logo slot", () => {
  it("clears a rounded hole, not a square one", () => {
    const logo = "data:image/png;base64,iVBORw0KGgo=";
    const svg = renderQrSvg("https://stillscans.net/x7k2mn", { ...DEFAULT_QR_DESIGN, logo });
    const size = Number(svg.match(/<image x="[\d.]+" y="[\d.]+" width="(\d+)"/)?.[1]);
    const width = Number(svg.match(/viewBox="0 0 (\d+)/)?.[1]) - 8;
    expect(size / width).toBeGreaterThan(0.24);
  });
});
