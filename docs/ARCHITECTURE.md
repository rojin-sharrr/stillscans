# Architecture

## The rules that matter

1. **`redirect` must never break.** It is small, reads only KV, holds no secrets and is deployed
   alone. A bad dashboard or billing deploy cannot take down a printed code.
2. **Postgres (Neon) is the source of truth. KV is a copy** that exists so redirects stay fast and
   keep working if the database has problems.
3. **Payment state never reaches KV.** "If you stop paying, your codes keep working" is enforced by
   structure: `redirect` cannot know whether someone paid.
4. **A short code is never reissued.** Archived rows stay, so a printed code can't later open a
   stranger's page.
5. **Never guess a verdict.** "Stopped scanning" needs positive evidence, and "Still scans" needs a
   response from the link. A timeout or a bot block is not evidence of either.
6. **`null` provider data means "Not yet verified"** and renders that way. Never fill a gap.

## How data flows

```
           creates/edits                    copies shortCode → destination
 web ───────────────────────▶ api ──▶ Neon ───────────────────────────▶ KV
                               ▲                                         │
                               │ queue consumer writes scans             │ reads only
                               └──────────── Queue ◀── scan event ── redirect ◀── phone camera
```

- **Writing a code:** `api` commits to Postgres, then writes KV. If KV fails the request still succeeds:
  `synced_version` stays behind `version`, and cron retries within 5 minutes.
- **Reading a code:** `redirect` reads KV, returns the 302, and sends the scan to the queue from
  `ctx.waitUntil`, so logging can't slow or fail a redirect. KV is eventually consistent: an edit
  can take about a minute to reach every location.
- **Scans:** the queue is at-least-once, so `redirect` assigns each event an id and the consumer
  ignores duplicates. Failed batches retry 5 times, then go to the dead-letter queue.

## The check pipeline

`POST /api/check` with `{ url }` or `{ decodedText }`. Send `Accept: application/x-ndjson` to get
progress as it happens, which drives the checking screen; otherwise it returns the final JSON.

| Step     | Code                          | What happens                                                           |
| -------- | ----------------------------- | ---------------------------------------------------------------------- |
| Read     | `checker/pipeline.ts`         | Non-link payloads (Wi-Fi, text) are `safe` without any fetch           |
| Follow   | `checker/trace.ts`            | Every hop by hand: 10 hops, 5s each, 20s total, GET with HEAD fallback |
| Classify | `checker/classify.ts`         | Pure function from trace to verdict. Start here to change a verdict    |
| Present  | `web/src/lib/verdict-copy.ts` | Result to words. Every sentence must be true of that result            |

| Situation                                                                 | Verdict                                        |
| ------------------------------------------------------------------------- | ---------------------------------------------- |
| Same site throughout, page answers                                        | `safe`                                         |
| Crosses sites, or starts on a known redirect domain, and the page loads   | `risk`                                         |
| Same, but a 403, 429, 5xx or timeout at the end                           | `risk`, marked unconfirmed                     |
| 404, 410, domain gone, redirect loop, parked domain                       | `dead`                                         |
| Dynamic code ending on a "deactivated" page or the provider's own website | `dead`                                         |
| First hop never answers                                                   | No verdict: `check_incomplete`, nothing stored |
| Internal or private target                                                | No verdict: `uncheckable_url`                  |

To teach the checker a provider's expired page, add substrings to that provider's `fingerprints`
in `packages/providers/src/providers.json`.

### SSRF

The checker fetches untrusted URLs. Defence is in `packages/url-safety`:

- Only http/https on ports 80 and 443, with no embedded credentials.
- Private, loopback, link-local, CGNAT and metadata addresses are refused, including IPv4-mapped
  IPv6. Numeric forms such as `2130706433` are normalised by `new URL()` first.
- Redirects are followed by hand, so every hop is vetted before it is requested.
- Names are resolved over DNS-over-HTTPS (two resolvers) and refused if any address is private. If
  both resolvers fail the fetch still proceeds, because Workers have no route to private networks.

## Database connections

Workers reach Neon through Hyperdrive, which pools in transaction mode, like PgBouncer. A connection
is only held within a transaction, so don't rely on session state between queries.

Hyperdrive's query cache is deliberately off. It isn't cleared by writes, so it would let signed-out
sessions keep working and show stale dashboards and code limits. Keep it off for any new config.

## Sign-in

Google is the only sign-in method. Sessions are 30-day HttpOnly cookies shared across
`.usestillscans.com`, stored only as hashes. Accounts are keyed by verified email.

- Google uses state and PKCE, and checks audience, issuer, expiry and that the email is verified.
- The callback URL comes from `API_ORIGIN`, because it must match the Google console exactly.
- Cookie-authenticated writes must carry our exact `Origin`, which stops cross-site requests.

## Plans

`PLANS` in `packages/shared/src/plans.ts` is the one place that says what each plan unlocks. The API
enforces it: free accounts get `plan_required` from `/api/analytics`, and for a logo or custom colors.
The web app only reflects this. Plans never reach KV, so no plan can affect a printed code.

No payment data is stored. Until payments exist, `pnpm plan:set <email> <plan> [env file]` sets a plan.

## Analytics

A scan can't identify a person, and we don't try. `redirect` records time, place from Cloudflare
(country, region, city), device type and operating system. It hashes
`salt | date | code | IP | user agent` into `visitor_hash`, which estimates distinct visitors. The IP
is never stored or sent, and the date in the hash stops anyone linking a person across days or codes.
Someone returning on another day counts again, which the dashboard says. Bots and prefetches are
redirected but not counted.

`GET /api/analytics` scopes every figure through `codes.user_id` and takes `days`, `device`, `country`
and `codeId`, so the dashboard and the code page share one query. To compare placements, a person
makes one code per placement.

Queries aggregate raw `scans` rows. That suits launch; at high volume, add a daily rollup table.

## QR codes

`web/src/lib/qr-render.ts` is a pure function from link and design to SVG. Before any download,
`QrPreview` rasterises that exact artwork and decodes it with ZXing, and the result is tied to the
artwork it tested. A code is only downloadable once it has scanned back to the expected link.

Static codes never touch the backend. A permanent code's design is stored with it but never reaches
KV, so changing a design can't affect a printed code.

## Privacy

Results sit behind unguessable ids, are `noindex`, and are deleted after 30 days. QR images are
decoded in the browser and never uploaded. Repeat checks within 5 minutes reuse the stored result
under a new id, so people never share a result link. Scans store place and device, never IP addresses.

## Operating it

- Logs are JSON, one object per line, viewable in Workers Logs. Errors carry a `requestId` that
  matches the `x-request-id` response header (the Cloudflare ray id in production).
- Worth alerting on: `kv_sync_failed`, `scan_insert_failed`, `maintenance_task_failed`,
  `kv_read_failed`, `bad_kv_record`, and any messages in the dead-letter queue.
- `unknown_domains` is the research queue: redirect domains people actually scanned that the
  directory doesn't have, with counts. `provider_reports` holds submitted updates.

## Decisions

| Decision                                                       | Why                                                                                                         |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Cloudflare Workers and KV with Neon Postgres                   | Workers keep redirects independent; Neon replaced D1 at the owner's request                                 |
| `node-postgres` through Hyperdrive, with Drizzle               | Neon's guidance for Cloudflare. Real transactions, and Hyperdrive pools connections for per-request Workers |
| Tests on PGlite                                                | Real Postgres in memory, so tests need no network or container                                              |
| Astro with Preact islands                                      | Static pages are crawlable and fast on phones, with no server to fail                                       |
| Provider data as reviewed JSON, not DB tables with an admin UI | One dataset for pages and matching; every change gets a review and a test run                               |
| Queue into Postgres for scans                                  | Dashboard analytics are plain SQL, and `redirect` still never touches the database                          |
| Streaming over POST, not SSE plus polling                      | One request, no step state to store, and it ends with the client                                            |
| QR decoding in the browser only                                | Privacy, and no WASM in the Worker                                                                          |

## Not built yet

Each of these has no design yet, or needs a decision.

| Area                     | State                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Server-side QR decoding  | Skipped. An image ZXing can't read shows "Couldn't read", with paste as the fallback   |
| Re-scanning destinations | Nothing sets `blocked` automatically. `redirect` honours it; a scheduled job is needed |
| Dark mode, OG images     | Not designed                                                                           |
