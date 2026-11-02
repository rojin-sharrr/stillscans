/**
 * Prepares an uploaded logo: removes a plain light background and trims the empty
 * space around the mark, so it fills its slot in the code instead of sitting small on
 * a tile. Pure, so it can be tested without a browser.
 */

export interface LogoPixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface CleanLogo {
  /** Crop to apply, in pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** True when the logo keeps a solid background, so it needs rounded corners to blend. */
  solid: boolean;
}

/** Colors this close to the background vanish; beyond EDGE_END they stay fully opaque. */
const EDGE_START = 26;
const EDGE_END = 78;
const CORNER_TOLERANCE = 30;
const MIN_LIGHT_BACKGROUND = 150;
const VISIBLE_ALPHA = 24;

function colorDistance(data: Uint8ClampedArray, offset: number, rgb: number[]): number {
  return Math.hypot(
    (data[offset] ?? 0) - (rgb[0] ?? 0),
    (data[offset + 1] ?? 0) - (rgb[1] ?? 0),
    (data[offset + 2] ?? 0) - (rgb[2] ?? 0),
  );
}

/** The shared corner color, if the image sits on one plain light background. */
function plainLightBackground({ data, width, height }: LogoPixels): number[] | null {
  const corners = [0, width - 1, (height - 1) * width, height * width - 1].map((index) =>
    [0, 1, 2].map((channel) => data[index * 4 + channel] ?? 0),
  );
  const rgb = [0, 1, 2].map(
    (channel) => corners.reduce((sum, color) => sum + (color[channel] ?? 0), 0) / 4,
  );
  const plain = corners.every(
    (color) => Math.hypot(...color.map((v, i) => v - (rgb[i] ?? 0))) < CORNER_TOLERANCE,
  );
  const light = 0.299 * (rgb[0] ?? 0) + 0.587 * (rgb[1] ?? 0) + 0.114 * (rgb[2] ?? 0);
  // A dark background stays: a light logo on it would vanish against a white code.
  return plain && light >= MIN_LIGHT_BACKGROUND ? rgb : null;
}

/**
 * Clears the background inward from the edges, so light areas inside the logo survive.
 * Edge pixels fade rather than cut off, which keeps curves smooth.
 */
function clearBackground({ data, width, height }: LogoPixels, rgb: number[]): void {
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const visit = (index: number) => {
    if (seen[index]) return;
    seen[index] = 1;
    const offset = index * 4;
    const distance = colorDistance(data, offset, rgb);
    if (distance >= EDGE_END) return;
    if (distance > EDGE_START) {
      const opacity = (distance - EDGE_START) / (EDGE_END - EDGE_START);
      data[offset + 3] = Math.round((data[offset + 3] ?? 255) * opacity);
      return;
    }
    data[offset + 3] = 0;
    stack.push(index);
  };

  for (let x = 0; x < width; x++) {
    visit(x);
    visit((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  while (stack.length > 0) {
    const index = stack.pop() ?? 0;
    const x = index % width;
    if (x > 0) visit(index - 1);
    if (x < width - 1) visit(index + 1);
    if (index >= width) visit(index - width);
    if (index + width < width * height) visit(index + width);
  }
}

function visibleBounds({ data, width, height }: LogoPixels) {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) > VISIBLE_ALPHA) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** Changes `pixels` in place, and says how to crop the result. */
export function cleanLogo(pixels: LogoPixels): CleanLogo {
  const { data, width, height } = pixels;
  const hasTransparentCorner = [0, width - 1, (height - 1) * width, height * width - 1].some(
    (index) => (data[index * 4 + 3] ?? 255) < VISIBLE_ALPHA,
  );
  const background = hasTransparentCorner ? null : plainLightBackground(pixels);
  if (background) clearBackground(pixels, background);

  const solid = !hasTransparentCorner && !background;
  const bounds = solid ? null : visibleBounds(pixels);
  return { x: 0, y: 0, width, height, ...bounds, solid };
}
