# Architecture

## The rules that matter

1. **`redirect` must never break.** It is small, reads only KV, holds no secrets and is deployed
   alone. A bad dashboard or billing deploy cannot take down a printed code.
2. **D1 is the source of truth. KV is a copy** that exists so redirects stay fast and keep working
   if D1 has problems.
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
 web ───────────────────────▶ api ──▶ D1 ─────────────────────────────▶ KV
                               ▲                                         │
                               │ queue consumer writes scans             │ reads only
                               └──────────── Queue ◀── scan event ── redirect ◀── phone camera
```

- **Writing a code:** `api` commits to D1, then writes KV. If KV fails the request still succeeds:
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

## Privacy

Results sit behind unguessable ids, are `noindex`, and are deleted after 30 days. QR images are
decoded in the browser and never uploaded. Repeat checks within 5 minutes reuse the stored result
under a new id, so people never share a result link. Scans store country, city and device type, not
IP addresses.

## Operating it

- Logs are JSON, one object per line, viewable in Workers Logs. Errors carry a `requestId` that
  matches the `x-request-id` response header (the Cloudflare ray id in production).
- Worth alerting on: `kv_sync_failed`, `scan_insert_failed`, `maintenance_task_failed`,
  `kv_read_failed`, `bad_kv_record`, and any messages in the dead-letter queue.
- `unknown_domains` is the research queue: redirect domains people actually scanned that the
  directory doesn't have, with counts. `provider_reports` holds submitted updates.

## Decisions

| Decision                                                       | Why                                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Cloudflare with D1 and KV, not the handoff's Next and Postgres | The agreed architecture                                                       |
| Astro with Preact islands                                      | Static pages are crawlable and fast on phones, with no server to fail         |
| Provider data as reviewed JSON, not DB tables with an admin UI | One dataset for pages and matching; every change gets a review and a test run |
| Queue into D1 for scans                                        | Dashboard analytics are plain SQL, and `redirect` still never touches D1      |
| Streaming over POST, not SSE plus polling                      | One request, no step state to store, and it ends with the client              |
| QR decoding in the browser only                                | Privacy, and no WASM in the Worker                                            |

## Not built yet

Each of these has no design yet, or needs a decision.

| Area                                                                                | State                                                                                               |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Sign-in                                                                             | `middleware/auth.ts` validates sessions, but nothing issues them. Needs an auth decision            |
| Stripe                                                                              | Not started. Paying should only raise `users.code_allowance`                                        |
| Create code, Pricing, Dashboard, Analytics, Guides, Comparison, Trust, Auth screens | No design. These links show the 404 page for now. The API for create, edit, stats and export exists |
| Server-side QR decoding                                                             | Skipped. An image ZXing can't read shows "Couldn't read", with paste as the fallback                |
| Re-scanning destinations                                                            | Nothing sets `blocked` automatically. `redirect` honours it; a scheduled job is needed              |
| Dark mode, OG images                                                                | Not designed                                                                                        |
