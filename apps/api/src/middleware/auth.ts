import { findSessionUser } from "@stillscans/db";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app";
import { ApiError } from "../lib/errors";
import { sha256Hex } from "../lib/ids";
import { readSessionCookie } from "../lib/session";

const unauthorized = () => new ApiError(401, "unauthorized", "Sign in to continue.");
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Accepts the session cookie, or a bearer token for API clients. Browsers attach
 * cookies automatically, so cookie-authenticated writes must also prove they came
 * from our own site. Bearer tokens are never attached automatically and need no check.
 */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const bearer = c.req.header("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const token = bearer ?? readSessionCookie(c);
  if (!token) throw unauthorized();

  if (!bearer && !SAFE_METHODS.has(c.req.method) && c.req.header("origin") !== c.env.WEB_ORIGIN) {
    throw new ApiError(403, "bad_origin", "This request didn't come from StillScans.");
  }

  const user = await findSessionUser(c.get("db"), await sha256Hex(token), Date.now());
  if (!user) throw unauthorized();

  c.set("user", user);
  await next();
};
