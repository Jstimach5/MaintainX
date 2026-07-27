# Backup and Restore

Everything the application stores lives in exactly two places:

1. **The PostgreSQL database** — all records (assets, work orders, history…)
2. **The storage directory** (`STORAGE_DIR`, default `./storage`; the
   `storage_data` volume under docker compose) — uploaded pictures and files

Back up both, always as a pair.

## Taking a backup

```bash
scripts/backup.sh                # writes ./backups/db-<stamp>.dump + files-<stamp>.tar.gz
scripts/backup.sh /mnt/usb       # or straight to a mounted drive
```

The script uses `pg_dump --format=custom` (safe while the app is running —
pg_dump takes a consistent snapshot) and tars the storage directory
(uploads are write-once files, so a live copy is safe). It keeps the last
14 backups of each kind and deletes older ones.

Under docker compose, run it inside the app container or point
`DATABASE_URL` at the published Postgres port.

**Schedule it.** Linux cron example (2:30 AM daily):

```
30 2 * * * cd /path/to/app && ./scripts/backup.sh /path/to/backup/drive >> backup.log 2>&1
```

## Restoring

1. Stop the app (and worker): `docker compose stop app worker` or Ctrl-C.
2. Restore the database (this REPLACES current data):

   ```bash
   pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" backups/db-<stamp>.dump
   ```

3. Restore the files:

   ```bash
   rm -rf storage && tar -xzf backups/files-<stamp>.tar.gz
   ```

   (Restore the pair from the SAME timestamp so pictures match their
   records.)

4. Start the app again and spot-check: log in, open a work order with a
   photo, confirm the photo renders.

## Verified procedure

This procedure is exercised in the repository's test log (TEST_LOG.md,
Phase 11): a seeded database was dumped, restored into a scratch database,
and row counts verified identical. Re-verify on your own infrastructure
after first deployment — a backup that has never been restored is a hope,
not a backup.
