export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  CHECK_LIMITER: RateLimit;
  REPORT_LIMITER: RateLimit;
  ENVIRONMENT: "development" | "staging" | "production";
  /** Exact origin allowed by CORS, e.g. https://usestillscans.com. */
  WEB_ORIGIN: string;
  SAFE_BROWSING_API_KEY?: string;
}
