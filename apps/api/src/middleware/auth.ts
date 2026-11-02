import { createDb, findSessionUser } from "@stillscans/db";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app";
import { ApiError } from "../lib/errors";
import { sha256Hex } from "../lib/ids";

/**
 * Accepts a bearer session token. The sign-in flow that issues tokens is not built
 * yet (see docs/ARCHITECTURE.md); this is the seam it plugs into.
 */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = c.req.header("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new ApiError(401, "unauthorized", "Sign in to continue.");

  const user = await findSessionUser(createDb(c.env.DB), await sha256Hex(token), Date.now());
  if (!user) throw new ApiError(401, "unauthorized", "Sign in to continue.");

  c.set("user", user);
  await next();
};
