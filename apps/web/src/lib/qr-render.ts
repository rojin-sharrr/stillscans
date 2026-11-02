import type { QrDesign } from "@stillscans/shared";
import QRCode from "qrcode";

/** Renders a code to a standalone SVG string. Pure, so it runs anywhere and is easy to test. */

const QUIET_ZONE = 4;
const FINDER = 7;
/** Share of the code's width taken by a logo. Error correction H recovers up to about 30%. */
const LOGO_SHARE = 0.27;
/** Clear space around the logo, in modules. */
const LOGO_MARGIN = 1;
/** Roundness of the cleared area, as a share of its width. */
const LOGO_ROUNDING = 0.3;
const FRAME_BORDER = 1.5;
const FRAME_BAND = 7;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isFinder(row: number, col: number, size: number): boolean {
  const near = (value: number) => value < FINDER;
  const far = (value: number) => value >= size - FINDER;
  return (near(row) && near(col)) || (near(row) && far(col)) || (far(row) && near(col));
}

function modulePath(x: number, y: number, style: QrDesign["modules"]): string {
  if (style === "dots") return `M${x + 0.5} ${y + 0.08}a.42.42 0 1 0 .001 0z`;
  if (style === "rounded") {
    return `M${x + 0.25} ${y}h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5a.25.25 0 0 1 .25-.25z`;
  }
  return `M${x} ${y}h1v1h-1z`;
}

function finder(x: number, y: number, design: QrDesign): string {
  const radius = design.modules === "square" ? 0 : design.modules === "rounded" ? 1.4 : 2;
  const inner = design.modules === "square" ? 0 : radius * 0.5;
  const { foreground: fg, background: bg } = design;
  return [
    `<rect x="${x}" y="${y}" width="7" height="7" rx="${radius}" fill="${fg}"/>`,
    `<rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx="${inner}" fill="${bg}"/>`,
    `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="${inner}" fill="${fg}"/>`,
  ].join("");
}

export function renderQrSvg(payload: string, design: QrDesign): string {
  const hasLogo = design.logo !== null;
  const qr = QRCode.create(payload, { errorCorrectionLevel: hasLogo ? "H" : "Q" });
  const size = qr.modules.size;

  const logoSize = hasLogo ? Math.round(size * LOGO_SHARE) : 0;
  const logoStart = (size - logoSize) / 2;
  // Whole modules are dropped by their center, so the hole has a soft rounded outline.
  const center = size / 2;
  const half = logoSize / 2 + LOGO_MARGIN;
  const radius = half * 2 * LOGO_ROUNDING;
  const inLogo = (row: number, col: number) => {
    if (!hasLogo) return false;
    const dx = Math.abs(col + 0.5 - center) - (half - radius);
    const dy = Math.abs(row + 0.5 - center) - (half - radius);
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) <= radius;
  };

  let path = "";
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (qr.modules.get(row, col) && !isFinder(row, col, size) && !inLogo(row, col)) {
        path += modulePath(col, row, design.modules);
      }
    }
  }

  const framed = design.frame === "label";
  const inset = QUIET_ZONE + (framed ? FRAME_BORDER : 0);
  const width = size + inset * 2;
  const height = width + (framed ? FRAME_BAND - FRAME_BORDER : 0);
  const { foreground: fg, background: bg } = design;

  const parts = [`<rect width="${width}" height="${height}" fill="${bg}"/>`];
  if (framed) {
    parts.push(
      `<rect width="${width}" height="${height}" rx="3" fill="${fg}"/>`,
      `<rect x="${FRAME_BORDER}" y="${FRAME_BORDER}" width="${width - FRAME_BORDER * 2}" height="${width - FRAME_BORDER * 2}" rx="1.5" fill="${bg}"/>`,
    );
    const text = design.callToAction;
    // Long text shrinks to fit. Stays a system font so exports match on every machine.
    const fontSize = Math.min(3.4, ((width - 4) / Math.max(text.length, 1)) * 1.7);
    parts.push(
      `<text x="${width / 2}" y="${width + FRAME_BAND / 2 - 0.9}" fill="${bg}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeXml(text)}</text>`,
    );
  }

  parts.push(`<g transform="translate(${inset} ${inset})">`);
  parts.push(
    finder(0, 0, design),
    finder(size - FINDER, 0, design),
    finder(0, size - FINDER, design),
  );
  parts.push(
    `<path d="${path}" fill="${fg}"${design.modules === "square" ? ' shape-rendering="crispEdges"' : ""}/>`,
  );
  if (design.logo) {
    parts.push(
      `<image x="${logoStart}" y="${logoStart}" width="${logoSize}" height="${logoSize}" href="${design.logo}" preserveAspectRatio="xMidYMid meet"/>`,
    );
  }
  parts.push("</g>");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="QR code">${parts.join("")}</svg>`;
}
