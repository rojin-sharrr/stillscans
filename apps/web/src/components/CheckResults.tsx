import type { CheckResult, CheckStep } from "@stillscans/shared";
import { useEffect, useState } from "preact/hooks";
import { ApiRequestError, fetchCheck, streamCheck } from "../lib/api";
import {
  beginCheck,
  type PendingCheck,
  recallScan,
  rememberScan,
  type ScanDetails,
  takePendingCheck,
} from "../lib/pending-check";
import { buildResultView, unreadableView } from "../lib/verdict-copy";
import { type StepState, Checking } from "./Checking";
import { ResultScreen } from "./ResultScreen";

type Screen =
  | { kind: "loading" }
  | { kind: "checking" }
  | { kind: "result"; result: CheckResult; scan: ScanDetails | null }
  | { kind: "unreadable"; reason: "unreadable" | "uncheckable"; scan: ScanDetails | null }
  | { kind: "failed"; message: string };

const INITIAL_STEPS: Record<CheckStep, StepState> = {
  reading: { state: "pending", detail: null },
  following: { state: "pending", detail: null },
  controls: { state: "pending", detail: null },
};

function resultIdFromPath(): string | null {
  const id = window.location.pathname.replace(/^\/check\/?/, "").replace(/\/$/, "");
  return id || null;
}

/** Runs a pending check or reloads a saved one, and shows whichever screen applies. */
export function CheckResults() {
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [steps, setSteps] = useState(INITIAL_STEPS);
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  useEffect(() => {
    const load = async (id: string) => {
      try {
        const result = await fetchCheck(id);
        setScreen({ kind: "result", result, scan: recallScan(id) });
      } catch (error) {
        const expired = error instanceof ApiRequestError && error.status === 404;
        setScreen({
          kind: "failed",
          message: expired
            ? "This result has expired. Results are deleted after 30 days."
            : "We couldn't load this result. Check your connection and try again.",
        });
      }
    };

    const run = async (pending: PendingCheck) => {
      const scan = { label: pending.label, thumbnail: pending.thumbnail };
      if (!pending.request) {
        setScreen({ kind: "unreadable", reason: "unreadable", scan });
        return;
      }
      setThumbnail(pending.thumbnail);
      setScreen({ kind: "checking" });
      let settled = false;
      try {
        await streamCheck(pending.request, (event) => {
          if (event.type === "step") {
            setSteps((current) => ({
              ...current,
              [event.step]: { state: event.state, detail: event.detail },
            }));
          } else if (event.type === "result") {
            settled = true;
            rememberScan(event.result.id, scan);
            window.history.replaceState(null, "", `/check/${event.result.id}`);
            setScreen({ kind: "result", result: event.result, scan });
          } else {
            settled = true;
            setScreen(
              event.code === "uncheckable_url"
                ? { kind: "unreadable", reason: "uncheckable", scan }
                : {
                    kind: "failed",
                    message:
                      event.code === "check_incomplete"
                        ? "We couldn't reach this link, so we can't say whether it still works. Try again in a moment."
                        : "Something went wrong. Please try again.",
                  },
            );
          }
        });
        if (!settled) throw new Error("Stream ended without a result");
      } catch (error) {
        const limited = error instanceof ApiRequestError && error.status === 429;
        setScreen({
          kind: "failed",
          message: limited
            ? "That's a lot of checks in a short time. Wait a minute and try again."
            : "We couldn't finish this check. Check your connection and try again.",
        });
      }
    };

    const id = resultIdFromPath();
    if (id) {
      void load(id);
      return;
    }
    const pending = takePendingCheck();
    if (pending) void run(pending);
    else window.location.replace("/");
  }, []);

  switch (screen.kind) {
    case "loading":
      return null;
    case "checking":
      return <Checking steps={steps} thumbnail={thumbnail} />;
    case "result":
      return (
        <ResultScreen
          view={buildResultView(screen.result)}
          result={screen.result}
          scan={screen.scan}
        />
      );
    case "unreadable":
      return (
        <ResultScreen
          view={unreadableView(screen.reason)}
          result={null}
          scan={screen.scan}
          onPasteLink={(url) => beginCheck({ request: { url }, label: null, thumbnail: null })}
        />
      );
    case "failed":
      return (
        <main class="narrow">
          <div class="card card-pad" role="alert">
            <h1 class="h3">We couldn't show this result</h1>
            <p class="muted pretty" style={{ marginTop: "8px" }}>
              {screen.message}
            </p>
            <a href="/" class="link-strong">
              Check another code
            </a>
          </div>
        </main>
      );
  }
}
