import {
  createDb,
  type Db,
  findCheck,
  findRecentCheck,
  insertCheck,
  recordUnknownDomain,
} from "@stillscans/db";
import { type CheckEvent, type CheckResult, checkRequestSchema } from "@stillscans/shared";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import {
  type CheckDeps,
  CheckIncompleteError,
  runCheck,
  UncheckableUrlError,
} from "../checker/pipeline";
import { ApiError, notFound } from "../lib/errors";
import { randomId, sha256Hex } from "../lib/ids";
import { errorFields, log } from "../lib/log";
import { rateLimit } from "../middleware/rate-limit";

const CACHE_WINDOW_MS = 5 * 60 * 1000;
const NDJSON = "application/x-ndjson";

/** A cached result gets a new id: two people checking one URL must not share a result link. */
async function fromCache(db: Db, inputHash: string, id: string, now: number) {
  const cached = await findRecentCheck(db, inputHash, now - CACHE_WINDOW_MS);
  if (!cached) return null;
  return { ...(JSON.parse(cached.result) as CheckResult), id, createdAt: now };
}

async function persist(db: Db, result: CheckResult, inputHash: string) {
  await insertCheck(db, {
    id: result.id,
    inputHash,
    result: JSON.stringify(result),
    createdAt: result.createdAt,
  });
  if (result.unknownDomain) await recordUnknownDomain(db, result.unknownDomain, result.createdAt);
}

export function checkRoutes(deps: (env: AppEnv["Bindings"]) => CheckDeps) {
  const routes = new Hono<AppEnv>();

  routes.post("/", rateLimit("CHECK_LIMITER"), async (c) => {
    const parsed = checkRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "invalid_request", "Send a url or decodedText.");

    const db = createDb(c.env.DB);
    const id = randomId();
    const now = Date.now();
    const inputHash = await sha256Hex(JSON.stringify(parsed.data));
    const checkDeps = deps(c.env);
    const requestId = c.get("requestId");

    const run = async (emit: (event: CheckEvent) => void): Promise<CheckResult> => {
      const cached = await fromCache(db, inputHash, id, now);
      const result = cached ?? (await runCheck(id, parsed.data, checkDeps, emit));
      await persist(db, result, inputHash);
      return result;
    };

    if (!c.req.header("accept")?.includes(NDJSON)) {
      try {
        return c.json(await run(() => {}));
      } catch (error) {
        if (error instanceof UncheckableUrlError) {
          throw new ApiError(422, "uncheckable_url", "We can't check this link.");
        }
        if (error instanceof CheckIncompleteError) {
          throw new ApiError(503, "check_incomplete", "We couldn't reach this link.");
        }
        throw error;
      }
    }

    // Streamed so the checking screen shows real progress rather than a timer.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: CheckEvent) =>
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        try {
          emit({ type: "result", result: await run(emit) });
        } catch (error) {
          if (error instanceof UncheckableUrlError) {
            emit({ type: "error", code: "uncheckable_url", message: "We can't check this link." });
          } else if (error instanceof CheckIncompleteError) {
            emit({
              type: "error",
              code: "check_incomplete",
              message: "We couldn't reach this link.",
            });
          } else {
            log("error", "check_failed", { requestId, ...errorFields(error) });
            emit({ type: "error", code: "internal", message: "Something went wrong." });
          }
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: { "content-type": NDJSON, "cache-control": "no-store" },
    });
  });

  routes.get("/:id", async (c) => {
    const row = await findCheck(createDb(c.env.DB), c.req.param("id"));
    if (!row) throw notFound("This result has expired or doesn't exist.");
    c.header("cache-control", "private, no-store");
    c.header("x-robots-tag", "noindex");
    return c.json(JSON.parse(row.result) as CheckResult);
  });

  return routes;
}
