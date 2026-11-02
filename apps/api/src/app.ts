import { createDb, type Db, type schema } from "@stillscans/db";
import { createSafeBrowsingChecker, resolveHost, type ThreatChecker } from "@stillscans/url-safety";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { CheckDeps } from "./checker/pipeline";
import type { Env } from "./env";
import { ApiError } from "./lib/errors";
import { randomId } from "./lib/ids";
import { errorFields, log } from "./lib/log";
import { analyticsRoutes } from "./routes/analytics";
import { authRoutes } from "./routes/auth";
import { checkRoutes } from "./routes/check";
import { codeRoutes } from "./routes/codes";
import { reportRoutes } from "./routes/reports";

export interface AppEnv {
  Bindings: Env;
  Variables: {
    user: typeof schema.users.$inferSelect;
    requestId: string;
    db: Db;
    closeDb: () => Promise<void>;
    /** Set by a streaming response, which outlives the handler and closes the pool itself. */
    streaming: boolean;
  };
}

/** External calls, injectable so tests never touch the network. */
export interface AppDeps {
  fetch: typeof fetch;
  threats: (env: Env) => ThreatChecker;
}

const defaultDeps: AppDeps = {
  fetch: (...args) => fetch(...args),
  threats: (env) => createSafeBrowsingChecker(env.SAFE_BROWSING_API_KEY),
};

export function createApp(deps: AppDeps = defaultDeps) {
  const app = new Hono<AppEnv>();

  const checkDeps = (env: Env): CheckDeps => ({
    fetch: deps.fetch,
    resolve: (host) => resolveHost(host, deps.fetch),
    threats: deps.threats(env),
  });

  app.use("*", async (c, next) => {
    const requestId = c.req.header("cf-ray") ?? randomId();
    c.set("requestId", requestId);
    await next();
    c.header("x-request-id", requestId);
  });

  app.use(
    "/api/*",
    cors({
      origin: (origin, c) => (origin === c.env.WEB_ORIGIN ? origin : null),
      allowHeaders: ["authorization", "content-type"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      exposeHeaders: ["x-request-id"],
      credentials: true,
      maxAge: 86400,
    }),
  );

  app.use("/api/*", async (c, next) => {
    const { db, close } = createDb(c.env.HYPERDRIVE.connectionString);
    c.set("db", db);
    c.set("closeDb", close);
    await next();
    if (!c.get("streaming")) c.executionCtx.waitUntil(close().catch(() => {}));
  });

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/api/auth", authRoutes(deps.fetch));
  app.route("/api/analytics", analyticsRoutes);
  app.route("/api/check", checkRoutes(checkDeps));
  app.route("/api/codes", codeRoutes(deps.threats));
  app.route("/api/reports", reportRoutes);

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Not found" } }, 404));

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    if (error instanceof HTTPException) {
      return c.json({ error: { code: "bad_request", message: error.message } }, error.status);
    }
    const requestId = c.get("requestId");
    log("error", "unhandled_error", { requestId, path: c.req.path, ...errorFields(error) });
    return c.json(
      { error: { code: "internal", message: "Something went wrong.", requestId } },
      500,
    );
  });

  return app;
}
