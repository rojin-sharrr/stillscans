#!/usr/bin/env bash
# Applies any migrations a database hasn't run yet. Paste its Neon URL when asked.
# The URL is hidden as you paste and is never saved or printed.
set -euo pipefail
cd "$(dirname "$0")/.."

read -rsp "Paste the Neon database URL: " url
echo

if [[ ! "$url" =~ ^postgres(ql)?:// ]]; then
  echo "That doesn't look like a Postgres URL. Nothing was changed." >&2
  exit 1
fi

# Migrations need the direct connection, so drop Neon's pooler suffix if it's there.
direct="${url/-pooler./.}"
host="$(sed -E 's#^[^@]*@([^:/?]+).*#\1#' <<<"$direct")"

echo "Database: $host"
read -rp "Apply un-applied migrations to this database? [y/N] " answer
if [[ ! "$answer" =~ ^[Yy]$ ]]; then
  echo "Cancelled. Nothing was changed."
  exit 0
fi

DATABASE_URL_UNPOOLED="$direct" pnpm --filter @stillscans/db exec drizzle-kit migrate
echo
echo "Done. Already-applied migrations were skipped."
