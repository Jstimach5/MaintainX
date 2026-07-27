# Project State

Last updated: 2026-07-27 (Phase 10 complete)

## Current phase

Phase 10 complete — bulk importer verified (Scenario D, 10k rows,
idempotent, safe rollback). Every §22 P0 module now exists. Next up:
Phase 11 (audit browser, backups, mobile pass, seed data).

## Last completed task

Phase 10: bulk imports — import_jobs/rows/mappings schema, CSV+XLSX
parsing (formula cells import their cached result only), normalization
maps, whole-file in-memory validation against preloaded lookups, dry-run,
skip/update/new strategies, atomic-claim background processing with
per-row outcomes + progress, issues CSV, audit trail, rollback that keeps
touched WOs; 13 new vitest (incl. 10k rows) + 4 new e2e (Scenario D).

## Current task

Begin Phase 11: audit-log browser (admin), backup script + restore doc
+ BACKUP_AND_RESTORE.md, §20 seed data, §21 mobile pass, clean-DB
migration re-verification.

## Next three tasks

1. Phase 11: audit browser + backups + mobile pass + seed data.
2. Phase 12: P1 set (timeline/calendar, downtime, corrective, dashboards,
   QR flows, docs).
3. Phase 13: definition-of-done sweep + §24 delivery report.

## Known failures

None. All suites green (135 vitest, 50 playwright).

## Current test results

- `npm test`: 135/135 pass (…, reports, bulk imports incl. 10k rows)
- `npm run test:e2e`: 50/50 pass (desktop + mobile projects)
- `npm run build && typecheck && lint`: clean
- Prod-mode /setup door: verified by hand both directions (TEST_LOG Phase 1)

## Database migration status

Migrations 0000–0009 (…; meters; import jobs/rows/mappings) applied
cleanly to cmms_dev/cmms_test/cmms_e2e.
Dev DB: postgres://cmms@localhost:5432/cmms_dev (sandbox local Postgres 16).

## Manual testing status

Phase 1 flows driven via Playwright (browser) + curl prod-mode checks. First
human-style walkthrough scheduled with seed data (Phase 11).

## Important design decisions

See DECISIONS.md: #1 stack (Next.js+TS+Postgres+Drizzle+pg-boss), #3 hand-
rolled sessions with revocation, #5 org-timezone calendar rules, #6
idempotency via DB constraints, #4 parts-module extension points (deferred).

## Exact command needed to resume

```bash
cd /home/user/MaintainX
service postgresql start   # sandbox only; real deployments use docker compose
npm install
npm run db:migrate && npm run dev
# background jobs: npm run worker
# checks: npm run typecheck && npm run lint && npm test
```
