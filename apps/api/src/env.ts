export interface Env {
  /** Connection to Neon through Cloudflare Hyperdrive. */
  HYPERDRIVE: Hyperdrive;
  KV: KVNamespace;
  CHECK_LIMITER: RateLimit;
  REPORT_LIMITER: RateLimit;
  ENVIRONMENT: "development" | "staging" | "production";
  /** Exact origin allowed by CORS, e.g. https://usestillscans.com. */
  WEB_ORIGIN: string;
  /** This API's public origin, e.g. https://api.usestillscans.com. */
  API_ORIGIN: string;
  /** Shares the session cookie with the web app, e.g. .usestillscans.com. Unset locally. */
  COOKIE_DOMAIN?: string;
  /** Without it, destinations aren't checked against Google's threat lists. */
  WEB_RISK_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}
