# Backup and Restore

Everything the application stores lives in exactly two places:

1. **The PostgreSQL database** — all records (assets, work orders, history…)
2. **The storage directory** (`STORAGE_DIR`, default `./storage`; the
   `storage_data` volume under docker compose) — uploaded pictures and files

Back up both, always as a pair.

## Taking a backup — production (docker-compose.prod.yml)

```bash
scripts/prod-backup.sh           # ./backups/db-daily-<stamp>.dump + files-daily-<stamp>.tar.gz
```

Runs `pg_dump --format=custom` **inside the db container** (no published
port needed) and archives the uploads volume through the app container.
Retention is automatic: last **7 daily**, **4 weekly** (Sundays),
**12 monthly** (1st of the month). It fails loudly on an empty dump
instead of pretending success.

**Schedule it** (2:17 AM daily) and **get a copy off the server** — one
machine is not a backup strategy:

```
17 2 * * * cd /opt/cmms && scripts/prod-backup.sh >> backups/backup.log 2>&1
47 2 * * * rsync -a /opt/cmms/backups/ user@other-machine:/srv/cmms-backups/
```

(Any equivalent works: `rclone` to cloud storage, a mounted NAS, etc.
Include a secured copy of `.env` and `docker-compose.prod.yml` in that
off-server location too — they are the configuration half of a restore.)

## Taking a backup — dev / bare-metal

```bash
scripts/backup.sh                # ./backups/db-<stamp>.dump + files-<stamp>.tar.gz  (keeps last 14)
scripts/backup.sh /mnt/usb       # or straight to a mounted drive
```

## Restoring — production

1. Stop the app and worker (leave db up):

   ```bash
   docker compose -f docker-compose.prod.yml stop app worker
   ```

2. Restore the database (REPLACES current data):

   ```bash
   docker compose -f docker-compose.prod.yml exec -T db \
     pg_restore --clean --if-exists --no-owner -U cmms -d cmms < backups/db-<class>-<stamp>.dump
   ```

3. Restore the files into the volume:

   ```bash
   docker compose -f docker-compose.prod.yml run --rm --no-deps \
     -v "$PWD/backups:/backups:ro" app \
     sh -c "rm -rf /data/storage && tar -xzf /backups/files-<class>-<stamp>.tar.gz -C /data"
   ```

   (Restore the pair from the SAME timestamp so pictures match their
   records.)

4. Start everything and spot-check:

   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

   Log in, open a work order with a photo, confirm the photo renders.

## Restoring — dev / bare-metal

1. Stop the app and worker.
2. `pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" backups/db-<stamp>.dump`
3. `rm -rf storage && tar -xzf backups/files-<stamp>.tar.gz`
4. Start and spot-check as above.

## Verified procedure

This procedure is exercised in the repository's test log (TEST_LOG.md,
Phase 11): a seeded database was dumped, restored into a scratch database,
and row counts verified identical. Re-verify on your own infrastructure
after first deployment — a backup that has never been restored is a hope,
not a backup.
