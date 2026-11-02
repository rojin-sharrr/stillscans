import { useEffect } from "preact/hooks";
import { loadDraft } from "../lib/qr-design";
import { rememberSignedIn } from "../lib/session-hint";

/** Google lands here once the session cookie is set. Picks up where the person left off. */
export function SignInVerify() {
  useEffect(() => {
    rememberSignedIn(true);
    window.location.replace(loadDraft() ? "/create" : "/dashboard");
  }, []);

  return (
    <div class="card card-pad" role="status">
      <h1 class="h3">Signing you in</h1>
    </div>
  );
}
