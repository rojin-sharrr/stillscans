# Deploying

Everything runs on Cloudflare. Create production and staging resources separately, so tests never
touch real customers' codes.

## 1. Create the resources

```sh
cd apps/api

pnpm exec wrangler d1 create stillscans
pnpm exec wrangler d1 create stillscans-staging
pnpm exec wrangler kv namespace create stillscans-codes
pnpm exec wrangler kv namespace create stillscans-codes-staging

for q in stillscans-scans stillscans-scans-dlq stillscans-scans-staging stillscans-scans-staging-dlq; do
  pnpm exec wrangler queues create "$q"
done
```

## 2. Fill in the ids

Replace every `REPLACE_WITH_*` value in `apps/api/wrangler.toml` and
`apps/redirect/wrangler.toml`. Both Workers must use the **same** KV namespace.

## 3. Set secrets

```sh
cd apps/api
pnpm exec wrangler secret put SAFE_BROWSING_API_KEY
pnpm exec wrangler secret put SAFE_BROWSING_API_KEY --env staging
```

Without this key, code creation returns 503 outside development. That is deliberate: no code is
issued for a destination that couldn't be vetted. `redirect` needs no secrets.

**Before launch:** check Google's terms for this key. The Safe Browsing Lookup API is documented for
non-commercial use, and Google directs commercial products to Web Risk. Switching means changing
`packages/url-safety/src/safe-browsing.ts` only.

## 4. Migrate and deploy

```sh
cd apps/api
pnpm exec wrangler d1 migrations apply stillscans --remote
pnpm exec wrangler deploy --env=""
cd ../redirect && pnpm exec wrangler deploy --env=""
cd ../web && pnpm exec astro build && pnpm exec wrangler deploy --env=""
```

Use `--env staging` for staging, and set `PUBLIC_API_URL` to the staging API when building web.

Deploy `api` before `redirect` the first time: `api` consumes the queue that `redirect` sends to.

## 5. Smoke test production

```sh
pnpm --filter @stillscans/api exec wrangler kv key put --remote --binding KV \
  code:test '{"d":"https://usestillscans.com/","s":"active"}' --env=""
curl -sI https://stillscans.net/test      # 302 to usestillscans.com
curl -s  https://api.usestillscans.com/health
```

## Continuous deployment

`.github/workflows/ci.yml` tests every pull request. `deploy.yml` deploys `main`, and only the apps
whose files changed. A change to a shared package deploys the apps that use it, and tests must pass
first. `redirect` runs its own tests again immediately before it deploys.

Add these GitHub repository secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Migrations do not run automatically. Apply them by hand before merging code that needs them, and
keep them backward compatible so the running Worker still works during the gap.

## Before going public

- [ ] Add a source URL for every provider claim in `packages/providers/src/providers.json`.
- [ ] Re-verify each provider and replace the placeholder "last verified" dates. The current dates
  came from the design's sample data, and the addendum requires each claim to cite the
  provider's own page.
- [ ] Confirm the redirect domains marked TBD by creating a test code with each provider.
- [ ] Set up alerts for the log events listed in `ARCHITECTURE.md`.
