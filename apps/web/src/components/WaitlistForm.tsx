import { useState } from "preact/hooks";
import { joinWaitlist } from "../lib/api";

type State = "idle" | "sending" | "sent" | "failed";

/** Collects interest in a plan that isn't on sale yet. */
interface Props {
  plan: "pro" | "business";
  label: string;
  initialEmail?: string;
  /** Puts the field and button on one line where there's room. */
  inline?: boolean;
}

export function WaitlistForm({ plan, label, initialEmail = "", inline = false }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [state, setState] = useState<State>("idle");

  const submit = async (event: Event) => {
    event.preventDefault();
    setState("sending");
    try {
      await joinWaitlist({ email: email.trim(), plan, source: window.location.pathname });
      setState("sent");
    } catch {
      setState("failed");
    }
  };

  if (state === "sent") {
    return (
      <p class="small" role="status">
        You're on the list. We'll email you when it launches.
      </p>
    );
  }

  const inputId = `ss-waitlist-${plan}`;
  return (
    <form class={inline ? "waitlist waitlist--inline" : "waitlist"} onSubmit={submit}>
      <label for={inputId} class="sr-only">
        Email address
      </label>
      <input
        id={inputId}
        class="input"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onInput={(event) => setEmail(event.currentTarget.value)}
      />
      {state === "failed" && (
        <p class="form-error" role="alert">
          We couldn't add you. Please try again.
        </p>
      )}
      <button type="submit" class="btn btn-secondary" disabled={state === "sending"}>
        {label}
      </button>
    </form>
  );
}
