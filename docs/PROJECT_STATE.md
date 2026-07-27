# Project State

Last updated: 2026-07-27 (Phase 11 complete)

## Current phase

Phase 11 complete — audit browser, tested backups, §20 seed data,
operator docs, clean-DB verification, extra mobile checks. ALL §22 P0
features are now Verified in FEATURE_MATRIX.md. Next up: Phase 12 (P1:
timeline/calendar, downtime planning, QR request flow, saved dashboards,
print reports, notification completeness, Scenario E/F e2e).

## Last completed task

Phase 11: audit browser (/admin/audit, filterable, read-only), backup
script + VERIFIED restore, §20 seed (npm run db:seed, logins in
ADMIN_GUIDE), docs/sample-import.csv, DEPLOYMENT/ADMIN_GUIDE/USER_GUIDE/
BACKUP_AND_RESTORE docs, clean-DB migrate+seed re-verified, 4 new e2e.

## Current task

Begin Phase 12 (P1): timeline + calendar views on /schedule, downtime
planning surfacing (Scenario E), QR scan → limited public request flow,
saved report filters/dashboards, print-friendly reports, notification
mentions, Scenario E/F e2e coverage.

## Next three tasks

1. Phase 12: P1 set (timeline/calendar, downtime surfacing, QR request
   flow, saved dashboards, print reports).
2. Phase 13: definition-of-done sweep + §24 delivery report.

## Known failures

None. All suites green (135 vitest, 54 playwright).

## Current test results

- `npm test`: 135/135 pass (…, reports, bulk imports incl. 10k rows)
- `npm run test:e2e`: 54/54 pass (desktop + mobile projects)
- Backup/restore + clean-DB migrate+seed: executed and verified
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
