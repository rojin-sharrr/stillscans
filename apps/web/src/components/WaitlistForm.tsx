import { useEffect, useState } from "preact/hooks";
import { fetchAccount, joinWaitlist } from "../lib/api";
import { isSignedIn } from "../lib/session-hint";

const joinedKey = (plan: string) => `ss:waitlist:${plan}`;

function rememberedJoin(plan: string): boolean {
  try {
    return localStorage.getItem(joinedKey(plan)) === "1";
  } catch {
    return false;
  }
}

function rememberJoin(plan: string): void {
  try {
    localStorage.setItem(joinedKey(plan), "1");
  } catch {
    // Only affects whether the button shows as joined on the next visit.
  }
}

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

  // The browser remembers visitors. For signed-in people the account is the record.
  useEffect(() => {
    if (rememberedJoin(plan)) {
      setState("sent");
      return;
    }
    if (!isSignedIn()) return;
    fetchAccount()
      .then((account) => {
        if (account.waitlist.includes(plan)) setState("sent");
      })
      .catch(() => {});
  }, [plan]);

  const submit = async (event: Event) => {
    event.preventDefault();
    setState("sending");
    try {
      await joinWaitlist({ email: email.trim(), plan, source: window.location.pathname });
      rememberJoin(plan);
      setState("sent");
    } catch {
      setState("failed");
    }
  };

  if (state === "sent") {
    return (
      <button type="button" class="btn btn-secondary waitlist-joined" disabled>
        <span aria-hidden="true">✓</span> You're on the list
      </button>
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
