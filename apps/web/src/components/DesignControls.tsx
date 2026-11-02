import type { QrDesign } from "@stillscans/shared";
import { useState } from "preact/hooks";
import { logoFromFile } from "../lib/qr-export";

const MODULES: { id: QrDesign["modules"]; label: string }[] = [
  { id: "square", label: "Square" },
  { id: "rounded", label: "Rounded" },
  { id: "dots", label: "Dots" },
];

interface Props {
  design: QrDesign;
  onChange: (design: QrDesign) => void;
}

export function DesignControls({ design, onChange }: Props) {
  const [logoError, setLogoError] = useState<string | null>(null);
  const update = (changes: Partial<QrDesign>) => onChange({ ...design, ...changes });

  const onLogo = async (file: File | undefined) => {
    if (!file) return;
    setLogoError(null);
    try {
      update({ logo: await logoFromFile(file) });
    } catch {
      setLogoError("We couldn't read that image. Try a PNG or JPG.");
    }
  };

  return (
    <div class="design-controls">
      <div class="design-controls__row">
        <label class="color-field">
          <span>Code color</span>
          <input
            type="color"
            value={design.foreground}
            onInput={(event) => update({ foreground: event.currentTarget.value.toUpperCase() })}
          />
          <span class="mono small">{design.foreground}</span>
        </label>
        <label class="color-field">
          <span>Background</span>
          <input
            type="color"
            value={design.background}
            onInput={(event) => update({ background: event.currentTarget.value.toUpperCase() })}
          />
          <span class="mono small">{design.background}</span>
        </label>
      </div>

      <div class="field">
        <span class="field__label" id="ss-modules">
          Dot style
        </span>
        <div role="radiogroup" aria-labelledby="ss-modules" class="segmented segmented--compact">
          {MODULES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={design.modules === id}
              onClick={() => update({ modules: id })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <label class="check-field">
        <input
          type="checkbox"
          checked={design.frame === "label"}
          onChange={(event) => update({ frame: event.currentTarget.checked ? "label" : "none" })}
        />
        Add a frame with a call to action
      </label>
      {design.frame === "label" && (
        <div class="field">
          <label for="ss-cta">Frame text</label>
          <input
            id="ss-cta"
            class="input"
            maxLength={32}
            placeholder="Scan for menu"
            value={design.callToAction}
            onInput={(event) => update({ callToAction: event.currentTarget.value })}
          />
        </div>
      )}

      <div class="field">
        <span class="field__label">Logo</span>
        <div class="logo-field">
          <label class="btn btn-secondary">
            {design.logo ? "Change logo" : "Add a logo"}
            <input
              type="file"
              accept="image/*"
              class="sr-only"
              onChange={(event) => void onLogo(event.currentTarget.files?.[0])}
            />
          </label>
          {design.logo && (
            <button type="button" class="btn btn-secondary" onClick={() => update({ logo: null })}>
              Remove
            </button>
          )}
        </div>
        {logoError && (
          <p class="form-error" role="alert">
            {logoError}
          </p>
        )}
      </div>
    </div>
  );
}
