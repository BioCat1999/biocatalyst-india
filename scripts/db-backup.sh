#!/usr/bin/env bash
# db-backup.sh — local PostgreSQL backup for Biocatalyst India (Milestone 8).
#
#   bash scripts/db-backup.sh [--db biocatalyst_dev] [--out backups] [--keep 14] [--dry-run]
#
# What it does:
#   1. pg_dump (custom format, -Fc) of the target database into a timestamped
#      directory: <out>/biocatalyst_YYYYmmddTHHMMSSZ/{db}.dump
#   2. Copies env files (.env, apps/web/.env*) next to the dump — they are part
#      of what must be restored (see docs/runbook.md). NEVER committed to git.
#   3. Prunes backup directories older than --keep (default 14) newest kept.
#
# Requires: local Postgres client tools (Ubuntu archive: postgresql-client)
# and a reachable server (see scripts/db-setup.sh). No network beyond
# localhost; nothing leaves the machine.
set -euo pipefail

DB="${BIOCATALYST_DB:-biocatalyst_dev}"
OUT="${BIOCATALYST_BACKUP_DIR:-backups}"
KEEP=14
DRY_RUN=0
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-biocatalyst}"
export PGHOST PGPORT PGUSER
# PGPASSWORD is picked up from the environment when set.

usage() {
  cat <<EOF
Usage: bash scripts/db-backup.sh [options]

Options:
  --db NAME      Database to back up (default: biocatalyst_dev, or \$BIOCATALYST_DB)
  --out DIR      Backup root directory (default: ./backups, or \$BIOCATALYST_BACKUP_DIR)
  --keep N       Keep the N newest backup directories (default: 14)
  --dry-run      Print the commands that would run, without touching the DB
  --help         Show this help

Env: PGHOST, PGPORT, PGUSER, PGPASSWORD, BIOCATALYST_DB, BIOCATALYST_BACKUP_DIR
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db) DB="$2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    --keep) KEEP="$2"; shift 2;;
    --dry-run) DRY_RUN=1; shift;;
    --help) usage; exit 0;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2;;
  esac
done

TS="$(date -u +%Y%m%dT%H%M%SZ)"
DIR="${OUT}/biocatalyst_${TS}"
DUMP="${DIR}/${DB}.dump"

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

echo "Backing up database '${DB}' -> ${DIR}"
run mkdir -p "${DIR}/env"

if ! command -v pg_dump >/dev/null 2>&1; then
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] (pg_dump not on PATH here — a real run requires postgresql-client)"
  else
    echo "ERROR: pg_dump not found. Install the Postgres client (Ubuntu archive: postgresql-client)." >&2
    exit 1
  fi
fi

# Custom-format dump: compressed, and restorable selectively with pg_restore.
run pg_dump -Fc -f "${DUMP}" "${DB}"
if [[ "$DRY_RUN" == "0" ]]; then
  echo "dump size: $(du -h "${DUMP}" | cut -f1)"
fi

# Env files are required to run the restored app — back them up alongside.
# (These contain secrets: backups/ is git-ignored and must stay local.)
for envfile in .env apps/web/.env apps/web/.env.local apps/web/.env.production; do
  if [[ -f "$envfile" ]]; then
    run cp "$envfile" "${DIR}/env/$(echo "$envfile" | tr '/' '_')"
    echo "saved env: $envfile"
  fi
done

# Retention: keep newest $KEEP backup directories.
if [[ "$DRY_RUN" == "0" ]]; then
  mapfile -t OLD < <(ls -1d "${OUT}"/biocatalyst_* 2>/dev/null | sort | head -n -"${KEEP}" || true)
  for d in "${OLD[@]:-}"; do
    [[ -n "$d" ]] && { rm -rf "$d"; echo "pruned old backup: $d"; }
  done
fi

echo "Backup complete: ${DIR}"
