import { useEffect, useState } from "preact/hooks";
import { fetchAuthConfig, googleSignInUrl } from "../lib/api";
import { Logo } from "./Logo";

/** Google's four-color mark. Its branding rules call for these exact colors. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l8 6.2C12.5 13.7 17.8 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.9 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.9c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 7.1-10.3 7.1-17.7z"
      />
      <path
        fill="#FBBC05"
        d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-8-6.2C1 16.4 0 20.1 0 24s1 7.6 2.6 10.8l7.9-6.2z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-5 2.3-8.2 2.3-6.2 0-11.5-4.2-13.4-9.9l-8 6.2C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

function AuthLogo() {
  return (
    <a href="/" aria-label="StillScans home" class="auth__logo">
      <Logo size={48} />
    </a>
  );
}

export function SignIn() {
  const [error, setError] = useState<string | null>(null);
  // Unknown until the API answers. The space is held so the page doesn't jump.
  const [google, setGoogle] = useState<boolean | null>(null);
  const [fromCreate, setFromCreate] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFromCreate(params.get("from") === "create");
    if (params.get("error") === "google") {
      setError("We couldn't sign you in with Google. Please try again.");
    }
    fetchAuthConfig()
      .then((config) => setGoogle(config.google))
      .catch(() => setGoogle(false));
  }, []);

  return (
    <div class="auth">
      <AuthLogo />
      <h1 class="auth__title">Sign in to StillScans</h1>
      {fromCreate && <p class="auth__note">Your code is saved. Sign in to finish creating it.</p>}
      {error && (
        <p class="form-error auth__error" role="alert">
          {error}
        </p>
      )}
      {google === false ? (
        <p class="form-error auth__error" role="alert">
          Sign-in isn't available right now. Please try again shortly.
        </p>
      ) : (
        <a
          class={
            google
              ? "btn btn-secondary auth__provider"
              : "btn btn-secondary auth__provider is-pending"
          }
          href={googleSignInUrl}
        >
          <GoogleMark />
          Continue with Google
        </a>
      )}
      <p class="auth__foot">No password and no card.</p>
    </div>
  );
}
