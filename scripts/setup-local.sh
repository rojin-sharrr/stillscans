#!/usr/bin/env bash
# Prepares local env files, the local database and the /test code. Safe to run again.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f apps/api/.dev.vars ] || cp apps/api/.dev.vars.example apps/api/.dev.vars
[ -f apps/web/.env ] || cp apps/web/.env.example apps/web/.env

STATE="$PWD/.wrangler/state"
(cd apps/api && pnpm exec wrangler d1 migrations apply stillscans --local --persist-to "$STATE")
(cd apps/redirect && pnpm exec wrangler kv key put --local --persist-to "$STATE" --binding KV \
  code:test '{"d":"https://usestillscans.com/","s":"active"}')
echo "Local setup complete."
