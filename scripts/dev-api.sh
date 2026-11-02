#!/usr/bin/env bash
# Runs api and redirect in one process, behind the local-only gateway. See scripts/dev-gateway.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
# shellcheck disable=SC1091
. ./.env
set +a
# Stands in for the Hyperdrive binding locally, using the direct connection as Hyperdrive would.
export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$DATABASE_URL_UNPOOLED"
exec pnpm exec wrangler dev -c scripts/dev-gateway/wrangler.toml -c apps/api/wrangler.toml \
  -c apps/redirect/wrangler.toml --port 8788 --persist-to .wrangler/state
