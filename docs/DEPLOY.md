# Deploying

Everything runs on Cloudflare. Create production and staging resources separately, so tests never
touch real customers' codes.

## 1. Production resources (done)

Created on the Cloudflare account, with their ids already in the `wrangler.toml` files:

| Resource   | Name                                          | Id                                 |
| ---------- | --------------------------------------------- | ---------------------------------- |
| KV         | `stillscans-codes`                            | `977aed734504486998a3607ef01906d6` |
| Queue      | `stillscans-scans` and `stillscans-scans-dlq` |                                    |
| Hyperdrive | `stillscans`                                  | `70a08af8c6844c128d2839948ddd5e22` |

Staging resources don't exist yet. To add them, create the same set with `-staging` names and fill
in the `REPLACE_WITH_STAGING_*` values.

## 2. Secrets

Set on the Workers: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (api) and `SCAN_SALT` (redirect).

Still needed on api: `SAFE_BROWSING_API_KEY`. Without it, creating a permanent code returns 503
outside development, because no code is issued for a destination that couldn't be vetted.

```sh
cd apps/api && pnpm exec wrangler secret put SAFE_BROWSING_API_KEY --env=""
```

**Check Google's terms for this key.** The Safe Browsing Lookup API is documented for non-commercial
use, and Google directs commercial products to Web Risk. Switching means changing
`packages/url-safety/src/safe-browsing.ts` only.

## 3. Google OAuth

Add to the OAuth client, then publish the app so sign-in isn't limited to test users:

- Authorized JavaScript origin: `https://usestillscans.com`
- Authorized redirect URI: `https://api.usestillscans.com/api/auth/google/callback`

## 4. Migrate and deploy

```sh
pnpm db:migrate:url   # paste the production URL
cd apps/api
pnpm exec wrangler deploy --env=""
cd ../redirect && pnpm exec wrangler deploy --env=""
cd ../web && PUBLIC_API_URL=https://api.usestillscans.com pnpm exec astro build \
  && pnpm exec wrangler deploy --env=""
```

Use `--env staging` for staging, and set `PUBLIC_API_URL` to the staging API when building web.

Deploy `api` before `redirect` the first time: `api` consumes the queue that `redirect` sends to.

Set `PUBLIC_API_URL` as shown: otherwise a local `apps/web/.env` bakes `localhost` into the live site.

## 5. Smoke test production

```sh
(cd apps/redirect && pnpm exec wrangler kv key put --remote --binding KV \
  code:test '{"d":"https://usestillscans.com/","s":"active"}' --env="")
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
- [ ] Publish a privacy policy covering scan data and the visitor hash.
- [ ] Set up alerts for the log events listed in `ARCHITECTURE.md`.
