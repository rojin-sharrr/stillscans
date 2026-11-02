import type { QrDesign } from "@stillscans/shared";
import { useEffect, useMemo, useState } from "preact/hooks";
import { designWarning } from "../lib/qr-design";
import { downloadPdf, downloadPng, downloadSvg, fileName, verifyScans } from "../lib/qr-export";
import { renderQrSvg } from "../lib/qr-render";

type ScanState = "checking" | "scans" | "fails";

const CHECK_DELAY_MS = 250;

interface Props {
  payload: string;
  design: QrDesign;
  name: string;
  /** False until the real link exists, so a placeholder can't be downloaded. */
  downloadable: boolean;
}

/**
 * Shows the code and proves it scans before offering a download. The check decodes
 * the same artwork the person will print, so a bad color or logo can't reach paper.
 */
export function QrPreview({ payload, design, name, downloadable }: Props) {
  const svg = useMemo(() => renderQrSvg(payload, design), [payload, design]);
  // Tied to the artwork it tested, so a result can never vouch for a later design.
  const [checked, setChecked] = useState<{ svg: string; scans: boolean } | null>(null);
  const state: ScanState = checked?.svg !== svg ? "checking" : checked.scans ? "scans" : "fails";
  const warning = designWarning(design);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(async () => {
      const scans = await verifyScans(svg, payload);
      if (current) setChecked({ svg, scans });
    }, CHECK_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [svg, payload]);

  const ready = downloadable && state === "scans" && !warning;
  const file = fileName(name);

  return (
    <div class="qr-preview">
      {/* Built by renderQrSvg, which escapes all text and only embeds validated PNG logos. */}
      <div class="qr-preview__art" dangerouslySetInnerHTML={{ __html: svg }} />
      <div class="qr-preview__status" role="status">
        {warning ? (
          <span class="badge tone-risk">
            <span aria-hidden="true" class="badge__glyph">
              !
            </span>
            May not scan
          </span>
        ) : state === "scans" ? (
          <span class="badge tone-safe">
            <span aria-hidden="true" class="badge__glyph">
              ✓
            </span>
            Still scans
          </span>
        ) : state === "fails" ? (
          <span class="badge tone-dead">
            <span aria-hidden="true" class="badge__glyph">
              ✕
            </span>
            Won't scan
          </span>
        ) : (
          <span class="small muted">Testing this design…</span>
        )}
      </div>
      {warning && <p class="small muted pretty">{warning}</p>}
      {!warning && state === "fails" && (
        <p class="small muted pretty">
          We couldn't read this design back. Try a smaller logo, plainer dots, or stronger colors.
        </p>
      )}
      {downloadable && (
        <div class="qr-preview__downloads">
          <button
            type="button"
            class="btn btn-primary"
            disabled={!ready}
            onClick={() => void downloadPng(svg, file)}
          >
            Download PNG
          </button>
          <div class="qr-preview__secondary">
            <button
              type="button"
              class="btn btn-secondary"
              disabled={!ready}
              onClick={() => downloadSvg(svg, file)}
            >
              SVG
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              disabled={!ready}
              onClick={() => void downloadPdf(svg, file)}
            >
              PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
