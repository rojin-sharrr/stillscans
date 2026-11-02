import { joinWaitlist } from "@stillscans/db";
import { joinWaitlistSchema } from "@stillscans/shared";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { ApiError } from "../lib/errors";
import { rateLimit } from "../middleware/rate-limit";

/** Interest in plans that aren't on sale yet. Joining twice is not an error. */
export const waitlistRoutes = new Hono<AppEnv>();

waitlistRoutes.post("/", rateLimit("REPORT_LIMITER"), async (c) => {
  const parsed = joinWaitlistSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, "invalid_request", "Enter a valid email address.");

  await joinWaitlist(c.get("db"), {
    email: parsed.data.email.toLowerCase(),
    plan: parsed.data.plan,
    source: parsed.data.source ?? null,
    createdAt: Date.now(),
  });
  return c.json({ ok: true }, 201);
});
