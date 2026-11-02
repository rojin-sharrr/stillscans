import { DEFAULT_QR_DESIGN, type QrDesign, withoutBranding } from "@stillscans/shared";
import { useEffect, useState } from "preact/hooks";
import { ApiRequestError, type Code, createCode, fetchAccount } from "../lib/api";
import { clearDraft, loadDraft, saveDraft } from "../lib/qr-design";
import { isSignedIn, rememberSignedIn } from "../lib/session-hint";
import { DesignControls } from "./DesignControls";
import { QrPreview } from "./QrPreview";

type Kind = "static" | "dynamic";

const PLACEHOLDER_LINK = "https://stillscans.net/xxxxxx";

const ERRORS: Record<string, string> = {
  invalid_destination: "Enter a valid web address, like joescafe.com/menu.",
  unsafe_destination: "This address is listed as unsafe, so we can't make a code for it.",
  safety_check_unavailable: "We couldn't check this address just now. Try again in a moment.",
  code_limit_reached: "You've used all your permanent codes. Archive one to free a slot.",
  plan_required: "Your logo and colors are part of Pro, which is coming soon.",
};

const KINDS: { id: Kind; title: string; body: string }[] = [
  {
    id: "dynamic",
    title: "Permanent code",
    body: "Change where it points without reprinting, and see scans. Keeps working even if you stop paying.",
  },
  {
    id: "static",
    title: "Static code",
    body: "Free forever, no account. The link is printed inside the code, so it can't be edited.",
  },
];

function withScheme(destination: string): string {
  const trimmed = destination.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function CreateCode() {
  const [destination, setDestination] = useState("");
  const [kind, setKind] = useState<Kind>("dynamic");
  const [label, setLabel] = useState("");
  const [design, setDesign] = useState<QrDesign>(DEFAULT_QR_DESIGN);
  const [sticker, setSticker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Code | null>(null);
  const [branding, setBranding] = useState(false);

  useEffect(() => {
    if (isSignedIn()) {
      fetchAccount()
        .then((account) => setBranding(account.features.branding))
        .catch(() => setBranding(false));
    }
    const params = new URLSearchParams(window.location.search);
    setSticker(params.has("sticker"));
    const draft = loadDraft();
    if (draft) {
      setDestination(draft.destination);
      setKind(draft.kind);
      setLabel(draft.label);
      setDesign(draft.design);
      clearDraft();
    }
    const fromCheck = params.get("destination");
    if (fromCheck) setDestination(fromCheck);
  }, []);

  // Drops branding left in a draft, so an account never sees a design it can't save.
  const activeDesign = branding ? design : withoutBranding(design);
  const hasDestination = destination.trim().length > 0;
  const payload = created
    ? `https://${created.printedLink}`
    : kind === "static" && hasDestination
      ? withScheme(destination)
      : PLACEHOLDER_LINK;

  const submit = async () => {
    setError(null);
    if (!hasDestination) {
      setError("Enter where the code should go.");
      return;
    }
    const draft = { destination, kind, label, design: activeDesign };
    if (!isSignedIn()) {
      saveDraft(draft);
      window.location.assign("/sign-in?from=create");
      return;
    }
    setSaving(true);
    try {
      const { code } = await createCode({
        destination,
        design: activeDesign,
        ...(label.trim() ? { label: label.trim() } : {}),
      });
      setCreated(code);
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.status === 401) {
        rememberSignedIn(false);
        saveDraft(draft);
        window.location.assign("/sign-in?from=create");
        return;
      }
      const code = failure instanceof ApiRequestError ? failure.code : "";
      setError(ERRORS[code] ?? "We couldn't create this code. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    return (
      <div class="create__layout">
        <div class="create__form">
          <section class="card card-pad">
            <h2 class="h3">Your permanent code is ready</h2>
            <p class="body-15 muted pretty" style={{ marginTop: "8px" }}>
              It keeps working whether or not you ever pay us. You can change where it points at any
              time without reprinting.
            </p>
            <dl class="panel__rows" style={{ marginTop: "16px" }}>
              <div>
                <dt>Printed link</dt>
                <dd>{created.printedLink}</dd>
              </div>
            </dl>
            <div class="create__actions">
              <a class="btn btn-secondary" href={`/dashboard/codes/${created.id}`}>
                See this code's scans
              </a>
              <a class="btn btn-secondary" href="/dashboard">
                Go to dashboard
              </a>
            </div>
          </section>
        </div>
        <aside class="create__preview">
          <div class="card card-pad">
            <QrPreview payload={payload} design={activeDesign} name={label} downloadable />
          </div>
        </aside>
      </div>
    );
  }

  const staticReady = kind === "static" && hasDestination;

  return (
    <div class="create__layout">
      <div class="create__form">
        {sticker && (
          <p class="update-bar">
            Download the new code, print it on a sticker the size of the old one, and place it on
            top.
          </p>
        )}

        <section class="card card-pad">
          <div class="step-no">01</div>
          <div class="field" style={{ marginTop: "12px" }}>
            <label for="ss-destination" class="h3">
              Where should it go?
            </label>
            <input
              id="ss-destination"
              class="input input-mono"
              inputMode="url"
              autoCapitalize="none"
              spellcheck={false}
              placeholder="joescafe.com/menu"
              value={destination}
              onInput={(event) => setDestination(event.currentTarget.value)}
            />
          </div>
        </section>

        <section class="card card-pad">
          <div class="step-no">02</div>
          <h2 class="h3" style={{ marginTop: "12px" }}>
            Choose a code
          </h2>
          <div class="kind-options" role="radiogroup" aria-label="Type of code">
            {KINDS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={kind === option.id}
                class={kind === option.id ? "kind-option is-selected" : "kind-option"}
                onClick={() => setKind(option.id)}
              >
                <span class="kind-option__title">{option.title}</span>
                <span class="kind-option__body">{option.body}</span>
              </button>
            ))}
          </div>
          {kind === "dynamic" && (
            <div class="field" style={{ marginTop: "16px" }}>
              <label for="ss-label">Name it (optional)</label>
              <input
                id="ss-label"
                class="input"
                maxLength={120}
                placeholder="123 Main St yard sign"
                value={label}
                onInput={(event) => setLabel(event.currentTarget.value)}
              />
              <p class="small muted pretty">
                Use one code per placement to compare them in your dashboard.
              </p>
            </div>
          )}
        </section>

        <section class="card card-pad">
          <div class="step-no">03</div>
          <h2 class="h3" style={{ margin: "12px 0 16px" }}>
            Make it yours
          </h2>
          <DesignControls design={activeDesign} onChange={setDesign} branding={branding} />
        </section>

        {error && (
          <p class="form-error" role="alert">
            {error}
          </p>
        )}

        {kind === "dynamic" ? (
          <button
            type="button"
            class="btn btn-primary"
            disabled={saving}
            onClick={() => void submit()}
          >
            {saving ? "Creating your code" : "Create permanent code"}
          </button>
        ) : (
          !hasDestination && <p class="small muted">Enter a destination to download your code.</p>
        )}
      </div>

      <aside class="create__preview">
        <div class="card card-pad">
          <h2 class="h3" style={{ marginBottom: "16px" }}>
            Preview
          </h2>
          <QrPreview
            payload={payload}
            design={activeDesign}
            name={label}
            downloadable={staticReady}
          />
          {kind === "dynamic" && (
            <p class="small muted pretty" style={{ marginTop: "12px" }}>
              Prints as <span class="mono">stillscans.net/xxxxxx</span>. You'll get the real link
              and downloads once it's created.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
