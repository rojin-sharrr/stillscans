#!/usr/bin/env bash
# Counts waitlist signups. Reads production by default; pass .env for the dev database.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
# shellcheck disable=SC1090
. "./${1:-.env.prod}"
set +a
psql "$DATABASE_URL_UNPOOLED" \
  -c "select plan, count(*) as signups from waitlist group by plan order by plan" \
  -c "select plan, coalesce(source, 'unknown') as source, count(*) as signups
      from waitlist group by plan, source order by signups desc"
