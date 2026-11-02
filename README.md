# StillScans

Check any QR code in plain English, and make permanent codes that keep working even if you stop paying.

| App                              | Domain                | Purpose                                                               |
| -------------------------------- | --------------------- | --------------------------------------------------------------------- |
| [`apps/web`](apps/web)           | usestillscans.com     | Static Astro site: checker, results, provider directory               |
| [`apps/api`](apps/api)           | api.usestillscans.com | Cloudflare Worker: check pipeline, codes, reports, background jobs    |
| [`apps/redirect`](apps/redirect) | stillscans.net        | Cloudflare Worker: short code → 302. Every printed code depends on it |

| Package                                      | Purpose                                      |
| -------------------------------------------- | -------------------------------------------- |
| [`packages/shared`](packages/shared)         | Wire contracts, validation, short codes      |
| [`packages/db`](packages/db)                 | D1 schema, migrations, queries               |
| [`packages/providers`](packages/providers)   | Provider directory data and domain matching  |
| [`packages/url-safety`](packages/url-safety) | URL rules, SSRF defence, DNS, threat lookups |

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing anything, and
[docs/DEPLOY.md](docs/DEPLOY.md) before going live.

## Run it locally

Needs Node 24 and pnpm via corepack. Run this once:

```sh
nvm use
corepack enable
pnpm install
pnpm setup:local
```

Then run each of these in its own terminal, after `nvm use`:

```sh
pnpm dev:api        # http://localhost:8788
pnpm dev:web        # http://localhost:4321
pnpm dev:redirect   # http://localhost:8787, optional
```

Open the site at `http://localhost:4321`, not `127.0.0.1`: CORS is exact. `pnpm dev:web` builds once,
so stop and restart it after changing web code. The redirect service is only needed to test short
links, for example `http://localhost:8787/test`.

## Everyday commands

```sh
pnpm test        # all tests
pnpm typecheck   # all types, including .astro files
pnpm lint        # biome
pnpm format      # biome, writing fixes
pnpm --filter @stillscans/db exec drizzle-kit generate   # new migration after editing schema.ts
```

## Design reference

The design handoff lives in `StillScans Core Screens/` at the repo root and is deliberately
git-ignored. Its `docs/` folder holds the brand brief, the provider addendum and the handoff
README. That README is truncated: the original was cut off partway through the backend spec.
Design files are references to recreate, not code to copy.
