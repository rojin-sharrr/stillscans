import type { CheckStep } from "@stillscans/shared";

export interface StepState {
  state: "pending" | "active" | "done";
  detail: string | null;
}

const STEPS: { id: CheckStep; label: string }[] = [
  { id: "reading", label: "Reading code" },
  { id: "following", label: "Following the link" },
  { id: "controls", label: "Checking who controls it" },
];

const STATE_TEXT = { pending: "", active: "In progress", done: "Done" };

/** Progress comes from the server as each step actually runs, never from a timer. */
export function Checking({
  steps,
  thumbnail,
}: {
  steps: Record<CheckStep, StepState>;
  thumbnail: string | null;
}) {
  return (
    <main class="checking">
      <div role="status" aria-live="polite" class="card card-pad card-raised">
        <div class="checking__head">
          {thumbnail ? (
            <img class="qr-thumb qr-thumb--64" src={thumbnail} alt="" />
          ) : (
            <div class="qr-thumb qr-thumb--64" aria-hidden="true">
              QR
            </div>
          )}
          <div>
            <h1 class="h3">Checking your code</h1>
            <div class="small muted">This usually takes a few seconds.</div>
          </div>
        </div>
        <ol class="steps">
          {STEPS.map(({ id, label }, index) => {
            const { state, detail } = steps[id];
            return (
              <li key={id} class={state === "pending" ? undefined : `is-${state}`}>
                <span aria-hidden="true" class="steps__mark">
                  {state === "done" ? "✓" : index + 1}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div class="steps__label">
                    {label} <span class="steps__state">{STATE_TEXT[state]}</span>
                  </div>
                  <div class="steps__detail">{detail}</div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <p class="small muted" style={{ marginTop: "16px", textAlign: "center" }}>
        We only read the code and follow its links. Nothing is saved to your account.
      </p>
    </main>
  );
}
