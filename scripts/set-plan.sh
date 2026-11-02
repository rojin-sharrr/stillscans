#!/usr/bin/env bash
# Sets an account's plan: ./scripts/set-plan.sh you@example.com pro [.env.prod]
# Until payments exist, this is how an account gets a paid plan. Defaults to the dev database.
set -euo pipefail
cd "$(dirname "$0")/.."

email="${1:?Usage: set-plan.sh <email> <free|pro|business> [env file]}"
plan="${2:?Usage: set-plan.sh <email> <free|pro|business> [env file]}"
case "$plan" in
  free) allowance=5 ;;
  pro) allowance=100 ;;
  business) allowance=1000 ;;
  *) echo "Plan must be free, pro or business." >&2; exit 1 ;;
esac

set -a
# shellcheck disable=SC1090
. "./${3:-.env}"
set +a
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -v email="$email" -v plan="$plan" \
  -v allowance="$allowance" <<'SQL'
update users set plan = :'plan', code_allowance = :allowance where email = lower(:'email')
returning email, plan, code_allowance;
SQL
