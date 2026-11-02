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

Recommended on api: `WEB_RISK_API_KEY`, from a Google Cloud project with the Web Risk API enabled.

```sh
cd apps/api && pnpm exec wrangler secret put WEB_RISK_API_KEY --env=""
```

Without it, codes are still created and the URL rules still apply, but destinations aren't checked
against Google's threat lists; each is logged as `destination_not_threat_checked`. With it, a failed
lookup blocks code creation rather than letting an unvetted link through.

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

Every push to `main` deploys to production. `deploy.yml` runs lint, types and tests first, then
deploys only the apps whose files changed, so a failed check stops the deploy. A change to a shared
package deploys the apps that use it. `ci.yml` tests pull requests without deploying.

Add these GitHub repository secrets under **Settings → Secrets and variables → Actions**:

| Secret                  | Value                                          |
| ----------------------- | ---------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | A Cloudflare API token that can deploy Workers |
| `CLOUDFLARE_ACCOUNT_ID` | `45b09943ce50f74d31175844d09cdc8f`             |
| `DATABASE_URL_UNPOOLED` | The production value from `.env.prod`          |

Production migrations run automatically before `api` deploys, so keep them backward compatible:
the running Worker still uses the old schema until its deploy finishes.

To redeploy without a code change, open **Actions → Deploy → Run workflow**. Only apps with changes
in the latest commit are deployed.

## Before going public

- [ ] Add a source URL for every provider claim in `packages/providers/src/providers.json`.
- [ ] Re-verify each provider and replace the placeholder "last verified" dates. The current dates
  came from the design's sample data, and the addendum requires each claim to cite the
  provider's own page.
- [ ] Confirm the redirect domains marked TBD by creating a test code with each provider.
- [ ] Publish a privacy policy covering scan data and the visitor hash.
- [ ] Set up alerts for the log events listed in `ARCHITECTURE.md`.
