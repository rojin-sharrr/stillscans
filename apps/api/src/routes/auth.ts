import { countLiveCodes, listWaitlistPlans, upsertUser } from "@stillscans/db";
import { PLANS } from "@stillscans/shared";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../app";
import type { Env } from "../env";
import { ApiError } from "../lib/errors";
import { randomId } from "../lib/ids";
import { errorFields, log } from "../lib/log";
import { endSession, startSession } from "../lib/session";
import { requireUser } from "../middleware/auth";

const OAUTH_COOKIE = "ss_oauth";
const OAUTH_COOKIE_SECONDS = 600;
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

function base64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function pkceChallenge(verifier: string): Promise<string> {
  return base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
}

interface GoogleClaims {
  iss?: string;
  aud?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean;
}

/**
 * The ID token came straight from Google's token endpoint over TLS, so Google's
 * OpenID guidance allows reading it without checking the signature. The claims
 * are still validated: that this token is for us, is current and has a verified email.
 */
function verifiedGoogleEmail(idToken: string, clientId: string, now: number): string | null {
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  const claims = JSON.parse(
    new TextDecoder().decode(Uint8Array.from(json, (c) => c.charCodeAt(0))),
  ) as GoogleClaims;
  const valid =
    claims.aud === clientId &&
    GOOGLE_ISSUERS.has(claims.iss ?? "") &&
    (claims.exp ?? 0) * 1000 > now &&
    claims.email_verified === true;
  return valid && claims.email ? claims.email.toLowerCase() : null;
}

/** Must match the Google console exactly, so it's configured rather than read off the request. */
function googleRedirectUri(env: Env): string {
  return `${env.API_ORIGIN}/api/auth/google/callback`;
}

export function authRoutes(fetcher: typeof fetch) {
  const routes = new Hono<AppEnv>();

  routes.get("/config", (c) =>
    c.json({ google: Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET) }),
  );

  routes.get("/google", async (c) => {
    const clientId = c.env.GOOGLE_CLIENT_ID;
    if (!clientId || !c.env.GOOGLE_CLIENT_SECRET) {
      throw new ApiError(404, "google_disabled", "Google sign-in isn't set up.");
    }
    const state = randomId();
    const verifier = `${randomId()}${randomId()}`;
    setCookie(c, OAUTH_COOKIE, `${state}.${verifier}`, {
      path: "/api/auth/google",
      httpOnly: true,
      secure: c.env.ENVIRONMENT !== "development",
      sameSite: "Lax",
      maxAge: OAUTH_COOKIE_SECONDS,
    });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: googleRedirectUri(c.env),
      response_type: "code",
      scope: "openid email",
      state,
      code_challenge: await pkceChallenge(verifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    return c.redirect(`${GOOGLE_AUTH_URL}?${params}`);
  });

  routes.get("/google/callback", async (c) => {
    const failed = () => c.redirect(`${c.env.WEB_ORIGIN}/sign-in?error=google`);
    const [state, verifier] = (getCookie(c, OAUTH_COOKIE) ?? "").split(".");
    deleteCookie(c, OAUTH_COOKIE, { path: "/api/auth/google" });

    const code = c.req.query("code");
    const clientId = c.env.GOOGLE_CLIENT_ID;
    const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
    if (
      !code ||
      !state ||
      !verifier ||
      !clientId ||
      !clientSecret ||
      c.req.query("state") !== state
    ) {
      return failed();
    }

    try {
      const response = await fetcher(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: googleRedirectUri(c.env),
          grant_type: "authorization_code",
          code_verifier: verifier,
        }),
      });
      if (!response.ok) throw new Error(`Google responded ${response.status}`);
      const { id_token: idToken } = (await response.json()) as { id_token?: string };
      const email = idToken ? verifiedGoogleEmail(idToken, clientId, Date.now()) : null;
      if (!email) throw new Error("Google returned no verified email");

      const db = c.get("db");
      const user = await upsertUser(db, randomId(), email, Date.now());
      await startSession(c, db, user.id);
      return c.redirect(`${c.env.WEB_ORIGIN}/sign-in/verify`);
    } catch (error) {
      log("error", "google_sign_in_failed", errorFields(error));
      return failed();
    }
  });

  routes.get("/me", requireUser, async (c) => {
    const { email, codeAllowance, id, plan } = c.get("user");
    const db = c.get("db");
    const [liveCodes, waitlist] = await Promise.all([
      countLiveCodes(db, id),
      listWaitlistPlans(db, email),
    ]);
    const { analytics, branding } = PLANS[plan];
    return c.json({
      email,
      codeAllowance,
      liveCodes,
      plan,
      features: { analytics, branding },
      waitlist,
    });
  });

  routes.post("/logout", requireUser, async (c) => {
    await endSession(c, c.get("db"));
    return c.body(null, 204);
  });

  return routes;
}
