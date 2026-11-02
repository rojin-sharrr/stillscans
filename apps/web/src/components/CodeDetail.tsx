import { DEFAULT_QR_DESIGN, type QrDesign } from "@stillscans/shared";
import { useCallback, useEffect, useState } from "preact/hooks";
import { ApiRequestError, archiveCode, type Code, fetchCode, updateCode } from "../lib/api";
import { checkedAgo, displayUrl } from "../lib/format";
import { rememberSignedIn } from "../lib/session-hint";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { CodeStatus } from "./CodeStatus";
import { DesignControls } from "./DesignControls";
import { QrPreview } from "./QrPreview";

const ERRORS: Record<string, string> = {
  invalid_destination: "Enter a valid web address, like joescafe.com/menu.",
  unsafe_destination: "This address is listed as unsafe, so we can't point a code at it.",
  safety_check_unavailable: "We couldn't check this address just now. Try again in a moment.",
  code_blocked: "This code was stopped for safety, so it can't be changed.",
  code_limit_reached: "You've used all your permanent codes. Archive one to restore this one.",
};

type History = { destination: string; createdAt: number }[];

function codeIdFromPath(): string {
  return decodeURIComponent(window.location.pathname.split("/").filter(Boolean).at(-1) ?? "");
}

export function CodeDetail() {
  const [code, setCode] = useState<Code | null>(null);
  const [history, setHistory] = useState<History>([]);
  const [destination, setDestination] = useState("");
  const [label, setLabel] = useState("");
  const [design, setDesign] = useState<QrDesign>(DEFAULT_QR_DESIGN);
  const [editingDesign, setEditingDesign] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);

  const onUnauthorized = useCallback(() => {
    rememberSignedIn(false);
    window.location.replace("/sign-in");
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await fetchCode(codeIdFromPath());
      setCode(data.code);
      setHistory(data.destinations);
      setDestination(displayUrl(data.code.destination));
      setLabel(data.code.label ?? "");
      setDesign(data.code.design ?? DEFAULT_QR_DESIGN);
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.status === 401) onUnauthorized();
      else setMissing(true);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (action: () => Promise<unknown>, done: string) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await load();
      setNotice(done);
    } catch (failure) {
      const key = failure instanceof ApiRequestError ? failure.code : "";
      setError(ERRORS[key] ?? "That didn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (missing) {
    return (
      <main class="narrow">
        <div class="card card-pad" role="alert">
          <h1 class="h3">We can't find this code</h1>
          <a class="link-strong" href="/dashboard">
            Back to your codes
          </a>
        </div>
      </main>
    );
  }
  if (!code) return null;

  const editable = code.status !== "blocked";
  const paused = code.status === "paused";
  const archived = code.status === "archived";

  return (
    <main class="wrap dashboard">
      <a href="/dashboard" class="back-link">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        Your codes
      </a>
      <div class="dashboard__head">
        <div>
          <h1 class="h1">{code.label ?? "Untitled code"}</h1>
          <p class="mono small" style={{ marginTop: "4px" }}>
            {code.printedLink}
          </p>
        </div>
        <CodeStatus status={code.status} />
      </div>

      {notice && (
        <p class="notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}

      <div class="create__layout">
        <div class="create__form">
          <section class="card card-pad checker">
            <h2 class="h3">Change where it points</h2>
            <p class="body-15 muted pretty">
              No reprinting. New scans follow the change within about a minute.
            </p>
            <div class="field">
              <label for="ss-destination">Opens</label>
              <input
                id="ss-destination"
                class="input input-mono"
                inputMode="url"
                autoCapitalize="none"
                spellcheck={false}
                disabled={!editable}
                value={destination}
                onInput={(event) => setDestination(event.currentTarget.value)}
              />
            </div>
            <div class="field">
              <label for="ss-label">Name</label>
              <input
                id="ss-label"
                class="input"
                maxLength={120}
                disabled={!editable}
                value={label}
                onInput={(event) => setLabel(event.currentTarget.value)}
              />
            </div>
            <button
              type="button"
              class="btn btn-primary"
              disabled={saving || !editable}
              onClick={() =>
                void save(
                  () =>
                    updateCode(code.id, {
                      destination,
                      label: label.trim() || null,
                    }),
                  "Saved.",
                )
              }
            >
              Save changes
            </button>
          </section>

          <section class="card card-pad checker">
            <h2 class="h3">Status</h2>
            <p class="body-15 muted pretty">
              {paused || archived
                ? "Scans show a paused page until you turn this code back on."
                : "Pausing shows a friendly page instead of your link. Archiving also frees a slot. The printed link is never given to anyone else."}
            </p>
            <div class="create__actions">
              {editable && (paused || archived) && (
                <button
                  type="button"
                  class="btn btn-secondary"
                  disabled={saving}
                  onClick={() =>
                    void save(
                      () => updateCode(code.id, { status: "active" }),
                      "This code is active.",
                    )
                  }
                >
                  Turn back on
                </button>
              )}
              {editable && !paused && !archived && (
                <button
                  type="button"
                  class="btn btn-secondary"
                  disabled={saving}
                  onClick={() =>
                    void save(
                      () => updateCode(code.id, { status: "paused" }),
                      "This code is paused.",
                    )
                  }
                >
                  Pause
                </button>
              )}
              {editable && !archived && (
                <button
                  type="button"
                  class="btn btn-secondary"
                  disabled={saving}
                  onClick={() => {
                    const sure = window.confirm(
                      "Archive this code? Printed copies will show a paused page until you turn it back on.",
                    );
                    if (sure) void save(() => archiveCode(code.id), "This code is archived.");
                  }}
                >
                  Archive
                </button>
              )}
            </div>
          </section>

          <section class="card card-pad">
            <h2 class="h3">Where it has pointed</h2>
            <ul class="recent">
              {history.map((entry) => (
                <li key={entry.createdAt}>
                  <span class="mono small history__url">{displayUrl(entry.destination)}</span>
                  <span class="muted">{checkedAgo(entry.createdAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside class="create__preview">
          <div class="card card-pad checker">
            <h2 class="h3">Your code</h2>
            <QrPreview
              payload={`https://${code.printedLink}`}
              design={design}
              name={code.label ?? code.shortCode}
              downloadable
            />
            <button
              type="button"
              class="btn btn-secondary"
              onClick={() => setEditingDesign(!editingDesign)}
            >
              {editingDesign ? "Close design" : "Change design"}
            </button>
            {editingDesign && (
              <>
                <DesignControls design={design} onChange={setDesign} />
                <button
                  type="button"
                  class="btn btn-primary"
                  disabled={saving}
                  onClick={() =>
                    void save(
                      () => updateCode(code.id, { design }),
                      "Design saved. Printed codes keep working as they are.",
                    )
                  }
                >
                  Save design
                </button>
              </>
            )}
          </div>
        </aside>
      </div>

      <AnalyticsPanel codeId={code.id} onUnauthorized={onUnauthorized} />
    </main>
  );
}
