import { findUserCode, scanAnalytics } from "@stillscans/db";
import { type AnalyticsResponse, analyticsQuerySchema, PLANS } from "@stillscans/shared";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { ApiError, notFound } from "../lib/errors";
import { requireUser } from "../middleware/auth";

const DAY_MS = 24 * 60 * 60 * 1000;

const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Charts need every day in the range, not only days with scans. Days are in UTC. */
function fillDays(rows: { day: string; scans: number }[], days: number, now: number) {
  const counts = new Map(rows.map((row) => [row.day, row.scans]));
  return Array.from({ length: days }, (_, index) => {
    const day = isoDay(now - (days - 1 - index) * DAY_MS);
    return { day, scans: counts.get(day) ?? 0 };
  });
}

export const analyticsRoutes = new Hono<AppEnv>();

analyticsRoutes.use("*", requireUser);

analyticsRoutes.get("/", async (c) => {
  if (!PLANS[c.get("user").plan].analytics) {
    throw new ApiError(403, "plan_required", "Full analytics is part of Pro.");
  }

  const parsed = analyticsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) throw new ApiError(400, "invalid_filters", "Those filters aren't valid.");

  const { days, device, country, codeId } = parsed.data;
  const db = c.get("db");
  const user = c.get("user");
  if (codeId && !(await findUserCode(db, user.id, codeId))) throw notFound();

  const now = Date.now();
  // Starts at midnight UTC, so the first day shown is a whole day.
  const since = Date.parse(isoDay(now - (days - 1) * DAY_MS));
  const data = await scanAnalytics(db, { userId: user.id, since, codeId, device, country });

  c.header("cache-control", "private, no-store");
  return c.json({
    ...data,
    days,
    byDay: fillDays(data.byDay, days, now),
  } satisfies AnalyticsResponse);
});
