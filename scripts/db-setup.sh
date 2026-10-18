#!/usr/bin/env bash
# db-setup.sh — idempotent local Postgres setup for Milestone 2.
#
#   pnpm db:setup          create role + databases (if missing), migrate, seed
#   pnpm db:setup --reset  drop both databases first, then recreate/migrate/seed
#
# Requires a local PostgreSQL server. On macOS, Homebrew PostgreSQL runs under
# the current user; on Linux the script uses the system `postgres` account.
set -euo pipefail

DB_USER="biocatalyst"
DB_PASS="biocatalyst"
DEV_DB="biocatalyst_dev"
TEST_DB="biocatalyst_test"
INGESTION_TEST_DB="biocatalyst_ingestion_test"
EXTRACTION_TEST_DB="biocatalyst_extraction_test"
MARKET_TEST_DB="biocatalyst_market_test"
AUTH_TEST_DB="biocatalyst_auth_test"
NOTIFICATIONS_TEST_DB="biocatalyst_notifications_test"
WEB_TEST_DB="biocatalyst_web_test"
RESET="${1:-}"

if [ "$(uname -s)" = "Darwin" ]; then
  PSQL_ADMIN=(psql postgres)
  CREATEDB_ADMIN=(createdb)
  DROPDB_ADMIN=(dropdb)
else
  PSQL_ADMIN=(sudo -u postgres psql)
  CREATEDB_ADMIN=(sudo -u postgres createdb)
  DROPDB_ADMIN=(sudo -u postgres dropdb)
fi

if [ "$RESET" = "--reset" ]; then
  for DB in "$DEV_DB" "$TEST_DB" "$INGESTION_TEST_DB" "$EXTRACTION_TEST_DB" "$MARKET_TEST_DB" "$AUTH_TEST_DB" "$NOTIFICATIONS_TEST_DB" "$WEB_TEST_DB"; do
    if "${PSQL_ADMIN[@]}" -tAc "SELECT 1 FROM pg_database WHERE datname='${DB}'" | grep -q 1; then
      # Terminate open connections so DROP succeeds.
      "${PSQL_ADMIN[@]}" -c \
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB}' AND pid <> pg_backend_pid();" \
        > /dev/null
      "${DROPDB_ADMIN[@]}" "$DB"
      echo "dropped database ${DB}"
    fi
  done
fi

# Idempotent role creation.
"${PSQL_ADMIN[@]}" -v ON_ERROR_STOP=1 <<EOF > /dev/null
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
EOF

for DB in "$DEV_DB" "$TEST_DB" "$INGESTION_TEST_DB" "$EXTRACTION_TEST_DB" "$MARKET_TEST_DB" "$AUTH_TEST_DB" "$NOTIFICATIONS_TEST_DB" "$WEB_TEST_DB"; do
  if ! "${PSQL_ADMIN[@]}" -tAc "SELECT 1 FROM pg_database WHERE datname='${DB}'" | grep -q 1; then
    "${CREATEDB_ADMIN[@]}" -O "$DB_USER" "$DB"
    echo "created database ${DB} (owner ${DB_USER})"
  fi
done

# Build the packages that provide the migrate/seed CLIs.
pnpm --filter @biocatalyst/db --filter @biocatalyst/data build > /dev/null

export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DEV_DB}"
pnpm --filter @biocatalyst/db migrate
pnpm --filter @biocatalyst/data seed:db

echo "db:setup complete — dev DB: ${DEV_DB}, test DB: ${TEST_DB}, ingestion test DB: ${INGESTION_TEST_DB}, extraction test DB: ${EXTRACTION_TEST_DB}, market test DB: ${MARKET_TEST_DB}, auth test DB: ${AUTH_TEST_DB}, notifications test DB: ${NOTIFICATIONS_TEST_DB}, web test DB: ${WEB_TEST_DB}"
echo "note: the ingestion/extraction/market/auth/notifications/web test DBs are migrated (+seeded where needed) by their own test suites"
