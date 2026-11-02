import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app";
import { ApiError } from "../lib/errors";

/** Per-client limit using a Cloudflare rate-limit binding, which is approximate by design. */
export function rateLimit(binding: "CHECK_LIMITER" | "REPORT_LIMITER"): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = c.req.header("cf-connecting-ip") ?? "local";
    const { success } = await c.env[binding].limit({ key });
    if (!success) throw new ApiError(429, "rate_limited", "Too many requests. Try again shortly.");
    await next();
  };
}
