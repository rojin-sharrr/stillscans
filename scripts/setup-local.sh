#!/usr/bin/env bash
# Prepares local env files, the dev database and the /test code. Safe to run again.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f apps/api/.dev.vars ] || cp apps/api/.dev.vars.example apps/api/.dev.vars
grep -q '^API_ORIGIN=' apps/api/.dev.vars || echo 'API_ORIGIN=http://localhost:8788' >>apps/api/.dev.vars
grep -q '^COOKIE_DOMAIN=' apps/api/.dev.vars || echo 'COOKIE_DOMAIN=' >>apps/api/.dev.vars
[ -f apps/redirect/.dev.vars ] || echo 'SCAN_SALT=local-development-only' >apps/redirect/.dev.vars
[ -f apps/web/.env ] || cp apps/web/.env.example apps/web/.env

STATE="$PWD/.wrangler/state"
./scripts/db-migrate.sh
(cd apps/redirect && pnpm exec wrangler kv key put --local --persist-to "$STATE" --binding KV \
  code:test '{"d":"https://usestillscans.com/","s":"active"}')
echo "Local setup complete."
