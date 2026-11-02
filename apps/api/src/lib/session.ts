import { type Db, deleteSession, insertSession } from "@stillscans/db";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../app";
import { randomId, sha256Hex } from "./ids";

const COOKIE_NAME = "ss_session";
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

/**
 * The session lives in an HttpOnly cookie, so page scripts can never read it.
 * `COOKIE_DOMAIN` shares it between usestillscans.com and api.usestillscans.com.
 */
function cookieOptions(c: Context<AppEnv>) {
  const local = c.env.ENVIRONMENT === "development";
  return {
    path: "/",
    httpOnly: true,
    secure: !local,
    sameSite: "Lax" as const,
    ...(c.env.COOKIE_DOMAIN ? { domain: c.env.COOKIE_DOMAIN } : {}),
  };
}

export function readSessionCookie(c: Context<AppEnv>): string | undefined {
  return getCookie(c, COOKIE_NAME);
}

export async function startSession(c: Context<AppEnv>, db: Db, userId: string): Promise<void> {
  const token = `${randomId()}${randomId()}`;
  const now = Date.now();
  await insertSession(db, {
    tokenHash: await sha256Hex(token),
    userId,
    expiresAt: now + SESSION_MS,
    createdAt: now,
  });
  setCookie(c, COOKIE_NAME, token, { ...cookieOptions(c), maxAge: SESSION_DAYS * 24 * 60 * 60 });
}

export async function endSession(c: Context<AppEnv>, db: Db): Promise<void> {
  const token = readSessionCookie(c);
  if (token) await deleteSession(db, await sha256Hex(token));
  deleteCookie(c, COOKIE_NAME, cookieOptions(c));
}
