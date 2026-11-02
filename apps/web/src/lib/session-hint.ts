/**
 * The session cookie is HttpOnly, so scripts can't see it. This flag only picks
 * which header link to show. It grants nothing: the API checks every request.
 */
const KEY = "ss:signed-in";

export function isSignedIn(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberSignedIn(signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // Only affects a header link.
  }
}
