#!/usr/bin/env bash
# Applies migrations. Defaults to the dev database in .env; pass .env.prod for production.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
# shellcheck disable=SC1090
. "./${1:-.env}"
set +a
pnpm --filter @stillscans/db exec drizzle-kit migrate
