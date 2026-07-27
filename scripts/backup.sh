#!/usr/bin/env bash
# Backup the database and uploaded files (§16).
# Usage: scripts/backup.sh [output-directory]   (default: ./backups)
# Requires: pg_dump on PATH; DATABASE_URL and STORAGE_DIR set (or .env).
set -euo pipefail

cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${DATABASE_URL:?DATABASE_URL is not set (copy .env.example to .env)}"
STORAGE_DIR="${STORAGE_DIR:-./storage}"

OUT_DIR="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT_DIR"

DB_FILE="$OUT_DIR/db-$STAMP.dump"
FILES_FILE="$OUT_DIR/files-$STAMP.tar.gz"

echo "Backing up database → $DB_FILE"
pg_dump --format=custom --no-owner --file="$DB_FILE" "$DATABASE_URL"

if [ -d "$STORAGE_DIR" ]; then
  echo "Backing up uploaded files → $FILES_FILE"
  tar -czf "$FILES_FILE" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")"
else
  echo "No storage directory at $STORAGE_DIR (no uploads yet) — skipping files archive."
fi

# Keep the last 14 backups of each kind.
ls -1t "$OUT_DIR"/db-*.dump 2>/dev/null | tail -n +15 | xargs -r rm --
ls -1t "$OUT_DIR"/files-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm --

echo "Backup complete."
echo "Restore instructions: docs/BACKUP_AND_RESTORE.md"
