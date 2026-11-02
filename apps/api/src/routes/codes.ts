import {
  type Code,
  countLiveCodes,
  findUserCode,
  insertCode,
  isUniqueViolation,
  listAllCodes,
  listCodes,
  listDestinations,
  updateCode,
} from "@stillscans/db";
import {
  createCodeSchema,
  generateShortCode,
  isReservedShortCode,
  type QrDesign,
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
import { log } from "../lib/log";
import { syncCodeToKv } from "../lib/sync";
import { requireUser } from "../middleware/auth";

const MAX_SHORT_CODE_ATTEMPTS = 5;

function presentCode(code: Code) {
  const { version: _v, syncedVersion: _s, userId: _u, design, ...fields } = code;
  return {
    ...fields,
    design: design ? (JSON.parse(design) as QrDesign) : null,
    printedLink: `${REDIRECT_HOST}/${code.shortCode}`,
  };
}

/**
 * Validates a destination. With a threat key set this fails closed: no code is issued
 * for a URL we tried and couldn't vet. Without a key it still applies the URL rules,
 * and logs each code so they can be re-checked once a key is added.
 */
async function vetDestination(input: string, threats: ThreatChecker): Promise<string> {
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
  if (threat === "unknown") {
    throw new ApiError(503, "safety_check_unavailable", "Try again in a moment.");
  }
  if (threat === "unchecked") log("warn", "destination_not_threat_checked", { hostname });
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
    const rows = await listCodes(c.get("db"), c.get("user").id);
    return c.json({
      codes: rows.map((row) => ({ ...presentCode(row), scans: row.scans })),
    });
  });

  /** "Export anytime": every code and where it points, archived included. */
  routes.get("/export", async (c) => {
    const rows = await listAllCodes(c.get("db"), c.get("user").id);
    c.header("content-disposition", 'attachment; filename="stillscans-codes.json"');
    return c.json({ exportedAt: new Date().toISOString(), codes: rows.map(presentCode) });
  });

  routes.post("/", async (c) => {
    const parsed = createCodeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "invalid_request", "Enter a destination.");

    const db = c.get("db");
    const user = c.get("user");
    assertAllowance(await countLiveCodes(db, user.id), user.codeAllowance);
    const destination = await vetDestination(parsed.data.destination, threats(c.env));

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
          design: parsed.data.design ? JSON.stringify(parsed.data.design) : null,
          now: Date.now(),
        });
        await syncCodeToKv(c.env, db, code);
        return c.json({ code: presentCode(code) }, 201);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new Error("Could not allocate a unique short code");
  });

  routes.get("/:id", async (c) => {
    const db = c.get("db");
    const code = await findUserCode(db, c.get("user").id, c.req.param("id"));
    if (!code) throw notFound();
    const history = await listDestinations(db, code.id);
    return c.json({
      code: presentCode(code),
      destinations: history.map(({ destination, createdAt }) => ({ destination, createdAt })),
    });
  });

  routes.patch("/:id", async (c) => {
    const parsed = updateCodeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "invalid_request", "Nothing to update.");

    const db = c.get("db");
    const user = c.get("user");
    const code = await findUserCode(db, user.id, c.req.param("id"));
    if (!code) throw notFound();
    if (code.status === "blocked") {
      throw new ApiError(409, "code_blocked", "This code was stopped for safety.");
    }

    const { destination, label, status, design } = parsed.data;
    if (code.status === "archived" && status === "active") {
      assertAllowance(await countLiveCodes(db, user.id), user.codeAllowance);
    }
    const vetted = destination ? await vetDestination(destination, threats(c.env)) : undefined;
    const destinationChanged = vetted !== undefined && vetted !== code.destination;

    const updated = await updateCode(
      db,
      code,
      {
        ...(destinationChanged ? { destination: vetted } : {}),
        ...(label !== undefined ? { label } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(design !== undefined ? { design: JSON.stringify(design) } : {}),
      },
      Date.now(),
      destinationChanged ? randomId() : null,
    );
    if (updated.version !== updated.syncedVersion) await syncCodeToKv(c.env, db, updated);
    return c.json({ code: presentCode(updated) });
  });

  /**
   * Archives rather than deletes. The row stays so the short code is never reissued
   * to someone else, while the printed link shows a paused page.
   */
  routes.delete("/:id", async (c) => {
    const db = c.get("db");
    const code = await findUserCode(db, c.get("user").id, c.req.param("id"));
    if (!code) throw notFound();
    if (code.status === "blocked") {
      throw new ApiError(409, "code_blocked", "This code was stopped for safety.");
    }
    if (code.status !== "archived") {
      await syncCodeToKv(
        c.env,
        db,
        await updateCode(db, code, { status: "archived" }, Date.now(), null),
      );
    }
    return c.body(null, 204);
  });

  return routes;
}
