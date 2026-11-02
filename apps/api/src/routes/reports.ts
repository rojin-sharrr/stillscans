import { getProvider } from "@stillscans/providers";
import { insertReport } from "@stillscans/db";
import { createReportSchema } from "@stillscans/shared";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { ApiError } from "../lib/errors";
import { randomId } from "../lib/ids";
import { rateLimit } from "../middleware/rate-limit";

/** "Report an update" and "Tell us about this provider". */
export const reportRoutes = new Hono<AppEnv>();

reportRoutes.post("/", rateLimit("REPORT_LIMITER"), async (c) => {
  const parsed = createReportSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, "invalid_request", "Add a message.");

  const { providerSlug, domain, message, email } = parsed.data;
  if (providerSlug && !getProvider(providerSlug)) {
    throw new ApiError(422, "unknown_provider", "That provider isn't in the directory.");
  }

  await insertReport(c.get("db"), {
    id: randomId(),
    providerSlug: providerSlug ?? null,
    domain: domain ?? null,
    message,
    email: email ?? null,
    createdAt: Date.now(),
  });
  return c.json({ ok: true }, 201);
});
