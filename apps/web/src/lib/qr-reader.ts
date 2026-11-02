import type { ReaderOptions } from "zxing-wasm/reader";

/**
 * Shared by the app and the regression test, so the test exercises what ships.
 * `tryHarder` matters: many real codes use rounded or dotted modules.
 */
export const QR_READER_OPTIONS: ReaderOptions = {
  formats: ["QRCode"],
  tryHarder: true,
  tryInvert: true,
  tryRotate: true,
  tryDownscale: true,
  maxNumberOfSymbols: 1,
};

/** The first valid payload, or null. */
export function firstText(results: { isValid: boolean; text: string }[]): string | null {
  return results.find((result) => result.isValid && result.text)?.text ?? null;
}
