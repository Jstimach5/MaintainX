#!/usr/bin/env bash
# Production backup for the docker-compose.prod.yml deployment.
# Dumps the database from inside the db container and archives the
# uploaded-files volume, with daily/weekly/monthly retention.
#
#   Usage:   scripts/prod-backup.sh [output-directory]   (default: ./backups)
#   Cron:    17 2 * * *  cd /opt/cmms && scripts/prod-backup.sh >> backups/backup.log 2>&1
#
# Retention: last 7 daily, 4 weekly (Sundays), 12 monthly (1st of month).
# Copy backups OFF this server too (rsync/rclone) — one machine is not a
# backup strategy; see docs/BACKUP_AND_RESTORE.md.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.prod.yml"
OUT_DIR="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DOW="$(date +%u)"   # 1..7, 7=Sunday
DOM="$(date +%d)"

CLASS="daily"
[ "$DOW" = "7" ] && CLASS="weekly"
[ "$DOM" = "01" ] && CLASS="monthly"

mkdir -p "$OUT_DIR"
DB_FILE="$OUT_DIR/db-$CLASS-$STAMP.dump"
FILES_FILE="$OUT_DIR/files-$CLASS-$STAMP.tar.gz"

echo "[$(date -Is)] database → $DB_FILE"
$COMPOSE exec -T db pg_dump --format=custom --no-owner -U cmms cmms > "$DB_FILE"
# A zero-byte dump means pg_dump failed silently through the pipe.
[ -s "$DB_FILE" ] || { echo "ERROR: empty database dump"; exit 1; }

echo "[$(date -Is)] uploads → $FILES_FILE"
$COMPOSE exec -T app tar -czf - -C /data storage > "$FILES_FILE"
[ -s "$FILES_FILE" ] || { echo "ERROR: empty files archive"; exit 1; }

keep() { # keep <pattern> <count>
  ls -1t "$OUT_DIR"/$1 2>/dev/null | tail -n +"$(( $2 + 1 ))" | xargs -r rm --
}
keep "db-daily-*.dump" 7;    keep "files-daily-*.tar.gz" 7
keep "db-weekly-*.dump" 4;   keep "files-weekly-*.tar.gz" 4
keep "db-monthly-*.dump" 12; keep "files-monthly-*.tar.gz" 12

echo "[$(date -Is)] backup complete ($CLASS): $(du -sh "$DB_FILE" | cut -f1) db, $(du -sh "$FILES_FILE" | cut -f1) files"
echo "Restore instructions: docs/BACKUP_AND_RESTORE.md"
