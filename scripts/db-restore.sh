#!/usr/bin/env bash
# db-restore.sh — restore a Biocatalyst India backup and verify it (Milestone 8).
#
#   bash scripts/db-restore.sh --backup backups/biocatalyst_<TS> [--target-db biocatalyst_restore_verify] [--drop] [--dry-run]
#
# Safety first: by default the dump is restored into a FRESH database named
# "<source>_restore_verify" (created if missing) so a restore never clobbers
# the live dev database by accident. Pass --target-db explicitly (with --drop
# if it already exists) for a real disaster-recovery restore.
#
# NOTE: creating/dropping databases requires a superuser role. Run as the
# OS postgres user, e.g.:
#   sudo -u postgres bash scripts/db-restore.sh --backup backups/biocatalyst_<TS>
# (or set PGUSER/PGPASSWORD to a superuser). pg_restore itself only needs to
# own the target database.
#
# After restore, verification queries run: schema_migrations is present with
# the expected latest migration, and the core tables have rows.
# See docs/runbook.md ("Backup & restore") for the full procedure.
set -euo pipefail

BACKUP=""
TARGET_DB=""
DROP=0
DRY_RUN=0
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-$(whoami)}"
# Maintenance database for createdb/psql when not connected to a target DB.
PGDATABASE="${PGDATABASE:-postgres}"
# Peer auth over the Unix socket when running as the postgres superuser
# without a password (e.g. `sudo -u postgres ...`); TCP+localhost would
# otherwise hang on a password prompt.
if [[ "$PGUSER" == "postgres" && -z "${PGPASSWORD:-}" && "${PGHOST}" == "localhost" ]]; then
  PGHOST=""
fi
export PGHOST PGPORT PGUSER PGDATABASE

usage() {
  cat <<EOF
Usage: bash scripts/db-restore.sh --backup DIR [options]

Options:
  --backup DIR   Backup directory created by db-backup.sh (required)
  --target-db DB Database to restore into (default: <source>_restore_verify)
  --drop         Drop --target-db first if it already exists (DANGEROUS)
  --dry-run      Print the commands that would run, without touching the DB
  --help         Show this help

Env: PGHOST (default localhost, or Unix socket when PGUSER=postgres with no
     PGPASSWORD), PGPORT, PGUSER (default: current OS user), PGPASSWORD,
     PGDATABASE (default postgres)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup) BACKUP="$2"; shift 2;;
    --target-db) TARGET_DB="$2"; shift 2;;
    --drop) DROP=1; shift;;
    --dry-run) DRY_RUN=1; shift;;
    --help) usage; exit 0;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2;;
  esac
done

if [[ -z "$BACKUP" ]]; then echo "ERROR: --backup is required" >&2; usage >&2; exit 2; fi
if [[ ! -d "$BACKUP" ]]; then echo "ERROR: backup directory not found: $BACKUP" >&2; exit 2; fi

DUMP="$(ls "${BACKUP}"/*.dump 2>/dev/null | head -n 1 || true)"
if [[ -z "$DUMP" ]]; then echo "ERROR: no .dump file in $BACKUP" >&2; exit 2; fi
SOURCE_DB="$(basename "$DUMP" .dump)"
if [[ -z "$TARGET_DB" ]]; then TARGET_DB="${SOURCE_DB}_restore_verify"; fi

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

MISSING=""
for bin in pg_restore psql createdb; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    if [[ "$DRY_RUN" == "1" ]]; then
      echo "[dry-run] (note: $bin not on PATH here — a real run requires postgresql-client)"
    else
      MISSING="$MISSING $bin"
    fi
  fi
done
if [[ -n "$MISSING" ]]; then
  echo "ERROR: missing Postgres client tools:$MISSING. Install postgresql-client (Ubuntu archive)." >&2
  exit 1
fi

echo "Restoring ${DUMP} -> database '${TARGET_DB}'"

if [[ "$DRY_RUN" == "0" ]] && psql -tAc "SELECT 1 FROM pg_database WHERE datname='${TARGET_DB}'" | grep -q 1; then
  if [[ "$DROP" == "1" ]]; then
    echo "WARNING: dropping existing database ${TARGET_DB}"
    psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${TARGET_DB}' AND pid <> pg_backend_pid();" >/dev/null
    dropdb "${TARGET_DB}"
  else
    echo "ERROR: target database '${TARGET_DB}' already exists. Use --drop to replace it, or pick another --target-db." >&2
    exit 2
  fi
fi

run createdb -O "$PGUSER" "${TARGET_DB}" || true
# Target is always a freshly created database (see --drop flow above), so no
# -c/--clean drops are needed — the dump creates every object exactly once.
run pg_restore -d "${TARGET_DB}" "${DUMP}"

echo "--- restore verification ---"
run psql -d "${TARGET_DB}" -v ON_ERROR_STOP=1 <<'EOF'
\echo 'latest migration applied:'
SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1;
\echo 'row counts:'
SELECT 'companies' AS tbl, count(*) FROM companies
UNION ALL SELECT 'events', count(*) FROM events
UNION ALL SELECT 'sources', count(*) FROM sources
UNION ALL SELECT 'issue_reports', count(*) FROM issue_reports;
EOF

echo "Restore verified into '${TARGET_DB}'."
echo "To use it as the live DB, set DATABASE_URL / TEST_DATABASE_URL accordingly,"
echo "or re-run with --target-db <live-db> --drop for a full disaster-recovery restore."
