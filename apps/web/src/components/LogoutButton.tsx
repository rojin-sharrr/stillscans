import { useState } from "preact/hooks";
import { signOut } from "../lib/api";
import { rememberSignedIn } from "../lib/session-hint";

/** A quiet icon in headers, or a text row in the phone menu. */
export function LogoutButton({ labelled = false }: { labelled?: boolean }) {
  const [busy, setBusy] = useState(false);

  const logOut = async () => {
    setBusy(true);
    await signOut().catch(() => {});
    rememberSignedIn(false);
    window.location.assign("/");
  };

  if (labelled) {
    return (
      <button type="button" class="text-btn" disabled={busy} onClick={() => void logOut()}>
        Sign out
      </button>
    );
  }
  return (
    <button
      type="button"
      class="icon-btn"
      aria-label="Sign out"
      title="Sign out"
      disabled={busy}
      onClick={() => void logOut()}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="m16 17 5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
    </button>
  );
}
