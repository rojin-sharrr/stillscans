# StillScans

QR code checker and permanent QR codes. Read `README.md` to run it, `docs/ARCHITECTURE.md` before
changing it, and `docs/REMAINING.md` for deferred work.

## Reminders

Raise these with the owner whenever they apply.

- **Before sharing the site publicly or when real users start signing up: turn on Web Risk.**
  Production runs without `WEB_RISK_API_KEY`, so destinations aren't checked against Google's threat
  lists. A bad link on a code could get `stillscans.net` flagged, which hurts every printed code.
  1. Google asked for billing on the `stillscans` project, and setup showed an unexplained $30
     charge. Read that screen carefully before accepting. Web Risk's free tier is 100,000 lookups
     a month.
  2. `cd apps/api && pnpm exec wrangler secret put WEB_RISK_API_KEY --env=""`
  3. Add the job that re-checks existing codes. Codes made before the key are logged as
     `destination_not_threat_checked` and were never screened.
  4. Add the "checked against known-unsafe-site lists" sentence to `/trust` only after this is live.
- **Before taking any payment:** ask the owner to confirm who the legal seller is. Then email the
  waitlist first (`pnpm waitlist:count`), and add payments only once people are asking to pay.
- **Before launch:** verify every provider claim. The "last verified" dates are placeholders.
- **Next:** build the deletion job. `/privacy` promises 24 months for scan records, and nothing deletes
  them yet.
- **Soon:** have a lawyer add warranty, liability, governing law and dispute terms to `/terms`, and
  review `/privacy`. Neither has had legal review. Add the full business address.

## Rules

- Every push to `main` deploys to production. Migrations run automatically, so keep them backward
  compatible.
- `redirect` must stay small and must never depend on Postgres or billing state.
- Use `psql` for database work. `.env` is the dev database, and `.env.prod` is production.
- Never run `neon deploy` for local work: it overwrites `.env` with production values.
- Hyperdrive caching stays off. Its cache ignores writes.
- Never commit `.env*`, `.dev.vars` or the `StillScans Core Screens/` design folder.
- Free launch, Google sign-in only, no Stripe for now.
- Test production from a hotspot: university Wi-Fi intercepts these domains.
- Commit messages and PR descriptions never include AI attribution.
