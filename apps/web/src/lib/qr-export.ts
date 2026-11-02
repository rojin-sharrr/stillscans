import { decodeCanvas } from "./decode";
import { cleanLogo } from "./logo-clean";

const PNG_SIZE = 2048;
const CHECK_SIZE = 640;
/** Sharp enough for print, with a fallback that fits the stored-logo limit. */
const LOGO_EDGES = [320, 200];
const MAX_LOGO_LENGTH = 85_000;
const LOGO_WORK_EDGE = 900;
const SOLID_LOGO_ROUNDING = 0.18;

function aspect(svg: string): number {
  const [, , width = 1, height = 1] = (svg.match(/viewBox="([\d. ]+)"/)?.[1] ?? "")
    .split(" ")
    .map(Number);
  return height / width;
}

async function svgToCanvas(svg: string, width: number): Promise<HTMLCanvasElement> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round(width * aspect(svg));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Proves the exact artwork scans back to the expected link. Styling can break a code. */
export async function verifyScans(svg: string, expected: string): Promise<boolean> {
  try {
    return (await decodeCanvas(await svgToCanvas(svg, CHECK_SIZE))) === expected;
  } catch {
    return false;
  }
}

function save(url: string, filename: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
}

export function downloadSvg(svg: string, name: string): void {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  save(url, `${name}.svg`);
  URL.revokeObjectURL(url);
}

export async function downloadPng(svg: string, name: string): Promise<void> {
  save((await svgToCanvas(svg, PNG_SIZE)).toDataURL("image/png"), `${name}.png`);
}

/** Loaded on demand: the PDF library is the largest thing on this page. */
export async function downloadPdf(svg: string, name: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const canvas = await svgToCanvas(svg, PNG_SIZE);
  const widthMm = 100;
  const heightMm = widthMm * aspect(svg);
  const pdf = new jsPDF({
    unit: "mm",
    format: [widthMm, heightMm],
    orientation: "portrait",
    compress: true,
  });
  // Without "FAST" jsPDF stores raw pixels: 12 MB for a code that is mostly flat color.
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, widthMm, heightMm, undefined, "FAST");
  pdf.save(`${name}.pdf`);
}

function canvasFor(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable");
  return { canvas, context };
}

/** Removes a plain background, trims the empty space, and stores a small PNG. */
export async function logoFromFile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const fit = Math.min(1, LOGO_WORK_EDGE / Math.max(bitmap.width, bitmap.height));
  const { canvas, context } = canvasFor(bitmap.width * fit, bitmap.height * fit);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const crop = cleanLogo(pixels);
  context.putImageData(pixels, 0, 0);

  for (const edge of LOGO_EDGES) {
    const scale = Math.min(1, edge / Math.max(crop.width, crop.height));
    const output = canvasFor(crop.width * scale, crop.height * scale);
    output.context.imageSmoothingQuality = "high";
    if (crop.solid) {
      const corner = Math.min(output.canvas.width, output.canvas.height) * SOLID_LOGO_ROUNDING;
      output.context.beginPath();
      output.context.roundRect(0, 0, output.canvas.width, output.canvas.height, corner);
      output.context.clip();
    }
    output.context.drawImage(
      canvas,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      output.canvas.width,
      output.canvas.height,
    );
    const url = output.canvas.toDataURL("image/png");
    if (url.length <= MAX_LOGO_LENGTH || edge === LOGO_EDGES.at(-1)) return url;
  }
  throw new Error("Unreachable: the last size always returns");
}

export function fileName(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug ? `stillscans-${slug}` : "stillscans-qr-code";
}
