import {
  type Code,
  countLiveCodes,
  createDb,
  findUserCode,
  insertCode,
  isUniqueViolation,
  listAllCodes,
  listCodes,
  listDestinations,
  scanStats,
  updateCode,
} from "@stillscans/db";
import {
  createCodeSchema,
  generateShortCode,
  isReservedShortCode,
  REDIRECT_HOST,
  updateCodeSchema,
  WEB_HOST,
} from "@stillscans/shared";
import { isSameSite, normalizeUrl, type ThreatChecker } from "@stillscans/url-safety";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import type { Env } from "../env";
import { ApiError, notFound } from "../lib/errors";
import { randomId } from "../lib/ids";
import { syncCodeToKv } from "../lib/sync";
import { requireUser } from "../middleware/auth";

const MAX_SHORT_CODE_ATTEMPTS = 5;
const STATS_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

function presentCode(code: Code) {
  const { version: _v, syncedVersion: _s, userId: _u, ...fields } = code;
  return { ...fields, printedLink: `${REDIRECT_HOST}/${code.shortCode}` };
}

/** Validates a destination, failing closed: no code is issued for a URL we couldn't vet. */
async function vetDestination(input: string, threats: ThreatChecker, env: Env): Promise<string> {
  const normalized = normalizeUrl(input);
  if (!normalized.ok) throw new ApiError(422, "invalid_destination", "Enter a valid web address.");

  const { hostname, href } = normalized.url;
  if (isSameSite(hostname, REDIRECT_HOST) || isSameSite(hostname, WEB_HOST)) {
    throw new ApiError(422, "invalid_destination", "A code can't point at StillScans itself.");
  }

  const threat = await threats.check(href);
  if (threat === "unsafe") {
    throw new ApiError(422, "unsafe_destination", "This address is listed as unsafe.");
  }
  if (threat === "unknown" && env.ENVIRONMENT !== "development") {
    throw new ApiError(503, "safety_check_unavailable", "Try again in a moment.");
  }
  return href;
}

function assertAllowance(live: number, allowance: number): void {
  if (live >= allowance) {
    throw new ApiError(403, "code_limit_reached", "You've used all your permanent codes.");
  }
}

export function codeRoutes(threats: (env: Env) => ThreatChecker) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireUser);

  routes.get("/", async (c) => {
    const rows = await listCodes(createDb(c.env.DB), c.get("user").id);
    return c.json({ codes: rows.map(presentCode) });
  });

  /** "Export anytime": every code and where it points, archived included. */
  routes.get("/export", async (c) => {
    const rows = await listAllCodes(createDb(c.env.DB), c.get("user").id);
    c.header("content-disposition", 'attachment; filename="stillscans-codes.json"');
    return c.json({ exportedAt: new Date().toISOString(), codes: rows.map(presentCode) });
  });

  routes.post("/", async (c) => {
    const parsed = createCodeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "invalid_request", "Enter a destination.");

    const db = createDb(c.env.DB);
    const user = c.get("user");
    assertAllowance(await countLiveCodes(db, user.id), user.codeAllowance);
    const destination = await vetDestination(parsed.data.destination, threats(c.env), c.env);

    for (let attempt = 0; attempt < MAX_SHORT_CODE_ATTEMPTS; attempt++) {
      const shortCode = generateShortCode();
      if (isReservedShortCode(shortCode)) continue;
      try {
        const code = await insertCode(db, {
          id: randomId(),
          historyId: randomId(),
          shortCode,
          userId: user.id,
          destination,
          label: parsed.data.label ?? null,
          now: Date.now(),
        });
        await syncCodeToKv(c.env, code);
        return c.json({ code: presentCode(code) }, 201);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new Error("Could not allocate a unique short code");
  });

  routes.get("/:id", async (c) => {
    const db = createDb(c.env.DB);
    const code = await findUserCode(db, c.get("user").id, c.req.param("id"));
    if (!code) throw notFound();
    const history = await listDestinations(db, code.id);
    return c.json({
      code: presentCode(code),
      destinations: history.map(({ destination, createdAt }) => ({ destination, createdAt })),
    });
  });

  routes.get("/:id/stats", async (c) => {
    const db = createDb(c.env.DB);
    const code = await findUserCode(db, c.get("user").id, c.req.param("id"));
    if (!code) throw notFound();
    return c.json(await scanStats(db, code.shortCode, Date.now() - STATS_WINDOW_MS));
  });

  routes.patch("/:id", async (c) => {
    const parsed = updateCodeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "invalid_request", "Nothing to update.");

    const db = createDb(c.env.DB);
    const user = c.get("user");
    const code = await findUserCode(db, user.id, c.req.param("id"));
    if (!code) throw notFound();
    if (code.status === "blocked") {
      throw new ApiError(409, "code_blocked", "This code was stopped for safety.");
    }

    const { destination, label, status } = parsed.data;
    if (code.status === "archived" && status === "active") {
      assertAllowance(await countLiveCodes(db, user.id), user.codeAllowance);
    }
    const vetted = destination
      ? await vetDestination(destination, threats(c.env), c.env)
      : undefined;
    const destinationChanged = vetted !== undefined && vetted !== code.destination;

    const updated = await updateCode(
      db,
      code,
      {
        ...(destinationChanged ? { destination: vetted } : {}),
        ...(label !== undefined ? { label } : {}),
        ...(status !== undefined ? { status } : {}),
      },
      Date.now(),
      destinationChanged ? randomId() : null,
    );
    if (updated.version !== updated.syncedVersion) await syncCodeToKv(c.env, updated);
    return c.json({ code: presentCode(updated) });
  });

  /**
   * Archives rather than deletes. The row stays so the short code is never reissued
   * to someone else, while the printed link shows a paused page.
   */
  routes.delete("/:id", async (c) => {
    const db = createDb(c.env.DB);
    const code = await findUserCode(db, c.get("user").id, c.req.param("id"));
    if (!code) throw notFound();
    if (code.status === "blocked") {
      throw new ApiError(409, "code_blocked", "This code was stopped for safety.");
    }
    if (code.status !== "archived") {
      await syncCodeToKv(
        c.env,
        await updateCode(db, code, { status: "archived" }, Date.now(), null),
      );
    }
    return c.body(null, 204);
  });

  return routes;
}
