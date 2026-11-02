import { useEffect, useState } from "preact/hooks";
import { sendReport } from "../lib/api";

type State = "idle" | "sending" | "sent" | "failed";

/** "Report an update" and "Tell us about this provider". Context comes from the query string. */
export function ReportForm() {
  const [providerSlug, setProviderSlug] = useState<string | undefined>();
  const [domain, setDomain] = useState<string | undefined>();
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setProviderSlug(params.get("provider") ?? undefined);
    setDomain(params.get("domain") ?? undefined);
  }, []);

  const submit = async (event: Event) => {
    event.preventDefault();
    setState("sending");
    try {
      await sendReport({ providerSlug, domain, message, email: email.trim() || undefined });
      setState("sent");
    } catch {
      setState("failed");
    }
  };

  if (state === "sent") {
    return (
      <p role="status" style={{ marginTop: "16px" }}>
        Thanks. We'll check it against the provider's own pages.
      </p>
    );
  }

  return (
    <form onSubmit={submit} class="checker" style={{ marginTop: "20px" }}>
      {domain && (
        <p class="small muted">
          About <span class="mono">{domain}</span>
        </p>
      )}
      <div class="field">
        <label for="ss-message">What should we know?</label>
        <textarea
          id="ss-message"
          class="input textarea"
          required
          maxLength={2000}
          value={message}
          onInput={(event) => setMessage(event.currentTarget.value)}
        />
      </div>
      <div class="field">
        <label for="ss-email">Email (optional)</label>
        <input
          id="ss-email"
          class="input"
          type="email"
          autoComplete="email"
          value={email}
          onInput={(event) => setEmail(event.currentTarget.value)}
        />
      </div>
      {state === "failed" && (
        <p class="form-error" role="alert">
          We couldn't send that. Please try again.
        </p>
      )}
      <button type="submit" class="btn btn-primary" disabled={state === "sending"}>
        Send
      </button>
    </form>
  );
}
