import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { beforeAll, describe, expect, it } from "vitest";
import { firstText, QR_READER_OPTIONS } from "../src/lib/qr-reader";

const require = createRequire(import.meta.url);

const fixture = (name: string) =>
  new Blob([readFileSync(new URL(`./fixtures/${name}`, import.meta.url))]);

describe("QR reader", () => {
  beforeAll(() => {
    const path = require.resolve("zxing-wasm/reader/zxing_reader.wasm");
    const { buffer } = new Uint8Array(readFileSync(path));
    prepareZXingModule({ overrides: { wasmBinary: buffer as ArrayBuffer } });
  });

  // jsQR returned nothing for this real Bitly code, though phone cameras read it.
  it("reads stylized codes with rounded modules", async () => {
    const results = await readBarcodes(fixture("stylized-bitly.png"), QR_READER_OPTIONS);
    expect(firstText(results)).toBe("https://bit.ly/4iiOr5x?r=qr");
  });

  it("ignores invalid results", () => {
    expect(firstText([{ isValid: false, text: "x" }])).toBeNull();
    expect(firstText([])).toBeNull();
  });
});
