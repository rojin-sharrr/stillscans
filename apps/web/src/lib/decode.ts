/**
 * QR decoding runs in the browser, so uploaded photos are never sent anywhere.
 * jsQR is loaded on demand to keep it out of the initial page weight.
 */
const MAX_EDGE = 1600;
const FALLBACK_EDGE = 800;
const THUMBNAIL_EDGE = 96;

async function jsqr() {
  return (await import("jsqr")).default;
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

function decodeCanvas(
  decode: Awaited<ReturnType<typeof jsqr>>,
  { canvas, context }: ReturnType<typeof drawScaled>,
): string | null {
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  return decode(data, canvas.width, canvas.height)?.data || null;
}

export interface DecodedImage {
  text: string | null;
  thumbnail: string | null;
}

export async function decodeImageFile(file: File): Promise<DecodedImage> {
  const decode = await jsqr();
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { text: null, thumbnail: null };
  }

  const { width, height } = bitmap;
  // Very large or noisy photos often decode better at a lower resolution.
  const text =
    decodeCanvas(decode, drawScaled(bitmap, width, height, MAX_EDGE)) ??
    decodeCanvas(decode, drawScaled(bitmap, width, height, FALLBACK_EDGE));
  const thumbnail = drawScaled(bitmap, width, height, THUMBNAIL_EDGE).canvas.toDataURL(
    "image/jpeg",
    0.7,
  );
  bitmap.close();
  return { text, thumbnail };
}

export async function createVideoDecoder() {
  const decode = await jsqr();
  return (video: HTMLVideoElement): string | null => {
    if (!video.videoWidth) return null;
    const frame = drawScaled(video, video.videoWidth, video.videoHeight, FALLBACK_EDGE);
    return decodeCanvas(decode, frame);
  };
}
