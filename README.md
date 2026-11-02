# StillScans

Check any QR code in plain English, and make permanent codes that keep working even if you stop paying.

| App                              | Domain                | Purpose                                                               |
| -------------------------------- | --------------------- | --------------------------------------------------------------------- |
| [`apps/web`](apps/web)           | usestillscans.com     | Static Astro site: checker, results, provider directory               |
| [`apps/api`](apps/api)           | api.usestillscans.com | Cloudflare Worker: checks, sign-in, codes, analytics, background jobs |
| [`apps/redirect`](apps/redirect) | stillscans.net        | Cloudflare Worker: short code → 302. Every printed code depends on it |

| Package                                      | Purpose                                      |
| -------------------------------------------- | -------------------------------------------- |
| [`packages/shared`](packages/shared)         | Wire contracts, validation, short codes      |
| [`packages/db`](packages/db)                 | Postgres schema, migrations, queries         |
| [`packages/providers`](packages/providers)   | Provider directory data and domain matching  |
| [`packages/url-safety`](packages/url-safety) | URL rules, SSRF defence, DNS, threat lookups |

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing anything, and
[docs/DEPLOY.md](docs/DEPLOY.md) before going live. Deferred work is in
[docs/REMAINING.md](docs/REMAINING.md).

## Run it locally

Needs Node 24, pnpm via corepack, and a `.env` with the dev database (see `.env.example`). Run this
once:

```sh
nvm use
corepack enable
pnpm install
pnpm setup:local
```

Then run each of these in its own terminal, after `nvm use`:

```sh
pnpm dev:api   # API and redirect, both on http://localhost:8788
pnpm dev:web   # http://localhost:4321
```

Open the site at `http://localhost:4321`, not `127.0.0.1`: CORS is exact. `pnpm dev:web` builds once,
so restart it after changing web code.

- **Sign in:** Google only. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `apps/api/.dev.vars`.
- **Test a scan:** open `http://localhost:8788/<code>`. Printed codes point at stillscans.net, which
  can't reach your machine. Scans appear in the dashboard within about 30 seconds.

Queues only connect Workers in one process, so `dev:api` runs both Workers behind a local-only
gateway in `scripts/dev-gateway`. It is never deployed.

## Everyday commands

```sh
pnpm test        # all tests
pnpm typecheck   # all types, including .astro files
pnpm lint        # biome
pnpm format      # biome, writing fixes
pnpm db:generate   # new migration after editing schema.ts
pnpm db:migrate    # apply to the dev database in .env
pnpm plan:set you@example.com pro   # set an account's plan (add .env.prod for production)
pnpm db:migrate:url   # paste any Neon URL and apply what it hasn't run yet
```

`neon deploy` writes the production branch's variables into `.env`, replacing the dev URL. Don't run
it for local work, or restore `.env` afterwards.

## Design reference

The design handoff lives in `StillScans Core Screens/` at the repo root and is deliberately
git-ignored. Its `docs/` folder holds the brand brief, the provider addendum and the handoff
README. That README is truncated: the original was cut off partway through the backend spec.
Design files are references to recreate, not code to copy.
