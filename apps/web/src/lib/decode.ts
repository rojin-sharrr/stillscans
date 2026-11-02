import { firstText, QR_READER_OPTIONS } from "./qr-reader";

/**
 * QR decoding runs in the browser, so uploaded photos are never sent anywhere.
 * The reader and its WASM are loaded on demand to keep them out of the initial
 * page weight. The WASM is served from this site, not the library's default CDN,
 * so checking a code doesn't depend on a third party.
 */
const MAX_EDGE = 2048;
const VIDEO_MAX_EDGE = 1024;
const THUMBNAIL_EDGE = 96;

async function loadReader() {
  const [{ prepareZXingModule, readBarcodes }, { default: wasmUrl }] = await Promise.all([
    import("zxing-wasm/reader"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ]);
  prepareZXingModule({ overrides: { locateFile: () => wasmUrl } });
  return async (image: ImageData) => firstText(await readBarcodes(image, QR_READER_OPTIONS));
}

function drawScaled(source: CanvasImageSource, width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

function pixels({ canvas, context }: ReturnType<typeof drawScaled>): ImageData {
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

/** Reads a rendered canvas. Used to prove a designed code still scans. */
export async function decodeCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const read = await loadReader();
  return read(context.getImageData(0, 0, canvas.width, canvas.height));
}

export interface DecodedImage {
  text: string | null;
  thumbnail: string | null;
}

/** Goes through the browser's image decoder, so HEIC photos and EXIF rotation work where supported. */
export async function decodeImageFile(file: File): Promise<DecodedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { text: null, thumbnail: null };
  }

  const { width, height } = bitmap;
  const thumbnail = drawScaled(bitmap, width, height, THUMBNAIL_EDGE).canvas.toDataURL(
    "image/jpeg",
    0.7,
  );
  try {
    const read = await loadReader();
    return { text: await read(pixels(drawScaled(bitmap, width, height, MAX_EDGE))), thumbnail };
  } catch {
    // A failed load must end in "Couldn't read" and its paste fallback, not a stuck button.
    return { text: null, thumbnail };
  } finally {
    bitmap.close();
  }
}

export async function createVideoDecoder() {
  const read = await loadReader();
  return async (video: HTMLVideoElement): Promise<string | null> => {
    if (!video.videoWidth) return null;
    return read(pixels(drawScaled(video, video.videoWidth, video.videoHeight, VIDEO_MAX_EDGE)));
  };
}
