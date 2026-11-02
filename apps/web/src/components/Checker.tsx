import { useCallback, useRef, useState } from "preact/hooks";
import { decodeImageFile } from "../lib/decode";
import { beginCheck } from "../lib/pending-check";
import { CameraScanner } from "./CameraScanner";

type Mode = "scan" | "upload" | "paste";

const MODES: { id: Mode; label: string }[] = [
  { id: "scan", label: "Scan" },
  { id: "upload", label: "Upload" },
  { id: "paste", label: "Paste link" },
];

/**
 * The checker input, used everywhere the design shows one. `compact` is the inline
 * version on directory pages, which drops the preview area but keeps every mode working.
 */
export function Checker({
  compact = false,
  idPrefix = "ss",
}: {
  compact?: boolean;
  idPrefix?: string;
}) {
  const [mode, setMode] = useState<Mode>("scan");
  const [camera, setCamera] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);

  const onDecoded = useCallback((decodedText: string) => {
    setCamera(false);
    beginCheck({ request: { decodedText }, label: null, thumbnail: null });
  }, []);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    const { text, thumbnail } = await decodeImageFile(file);
    beginCheck({
      request: text ? { decodedText: text } : null,
      label: file.name,
      thumbnail,
    });
  };

  const submit = () => {
    setError(null);
    if (mode === "scan") return setCamera(true);
    if (mode === "upload") return fileInput.current?.click();
    if (!url.trim()) {
      setError("Paste the link first.");
      urlInput.current?.focus();
      return;
    }
    beginCheck({ request: { url: url.trim() }, label: null, thumbnail: null });
  };

  const inputId = `${idPrefix}-link`;

  return (
    <div class="checker">
      <div
        role="tablist"
        aria-label="How to add your code"
        class={compact ? "segmented segmented--compact" : "segmented"}
      >
        {MODES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => {
              setMode(id);
              setError(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {!compact && mode === "scan" && (
        <button type="button" class="dropzone" onClick={() => setCamera(true)}>
          <span class="dropzone__inner dropzone__inner--scan">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
            Your camera opens full-screen. Point it at the code.
          </span>
        </button>
      )}

      {!compact && mode === "upload" && (
        <button
          type="button"
          class={dragging ? "dropzone is-dragging" : "dropzone"}
          onClick={() => fileInput.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void onFile(event.dataTransfer?.files[0]);
          }}
        >
          <span class="dropzone__inner">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="M17 8l-5-5-5 5" />
              <path d="M12 3v12" />
            </svg>
            <span>
              Drop a photo or screenshot of the code, or{" "}
              <span class="dropzone__choose">choose a file</span>.
            </span>
          </span>
        </button>
      )}

      {mode === "paste" && (
        <div class="field">
          <label for={inputId}>Link inside the code</label>
          <input
            ref={urlInput}
            id={inputId}
            class="input input-mono"
            placeholder="qrfy.com/r/abc"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellcheck={false}
            value={url}
            aria-invalid={error !== null}
            onInput={(event) => setUrl(event.currentTarget.value)}
            onKeyDown={(event) => event.key === "Enter" && submit()}
          />
          {!compact && (
            <div class="small muted">
              Paste the short link if you can see it printed under the code.
            </div>
          )}
        </div>
      )}

      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        class="sr-only"
        tabIndex={-1}
        aria-label="Choose a photo of the code"
        onChange={(event) => void onFile(event.currentTarget.files?.[0])}
      />

      <button type="button" class="btn btn-primary" disabled={busy} onClick={submit}>
        {busy ? "Reading your photo" : "Check my QR code"}
      </button>
      {!compact && <p class="checker__note">Free. No account. Results stay private.</p>}

      {camera && <CameraScanner onDecoded={onDecoded} onCancel={() => setCamera(false)} />}
    </div>
  );
}
