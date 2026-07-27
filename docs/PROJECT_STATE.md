# Project State

Last updated: 2026-07-27 (Phase 9 complete)

## Current phase

Phase 9 complete — schedule view + warnings, reports + CSV, real
dashboard, meter trend chart all verified. Next up: Phase 10 (bulk
imports, Scenario D).

## Last completed task

Phase 9: reporting core — reports service with unit-tested KPI
definitions (canceled never counts as completed), §11 manager warnings
(overdue PM, offline-after-completion, downtime conflicts, past-due
planning, archived assets, inactive assignees), /schedule table view,
/reports with tiles + bar breakdowns + CSV export (formula-sanitized),
role-aware dashboard, meter trend LineChart; 10 new vitest + 5 new e2e.

## Current task

Begin Phase 10: bulk CSV/XLSX imports — import_jobs/import_rows schema,
upload + header detection + column mapping with reusable templates,
whole-file validation with dry-run preview, duplicate strategies
(external-id/skip/update/new), background processing via pg-boss with live
progress, row-error download, idempotent re-runs, safe rollback, 10k-row
test, Scenario D e2e.

## Next three tasks

1. Phase 10: bulk CSV/XLSX imports (Scenario D).
2. Phase 11: audit browser + backups + mobile pass + seed data.
3. Phase 12: P1 set (timeline/calendar, downtime, corrective, dashboards,
   QR flows, docs).

## Known failures

None. All suites green (122 vitest, 46 playwright).

## Current test results

- `npm test`: 122/122 pass (…, meters/triggers, report KPIs/warnings)
- `npm run test:e2e`: 46/46 pass (desktop + mobile projects)
- `npm run build && typecheck && lint`: clean
- Prod-mode /setup door: verified by hand both directions (TEST_LOG Phase 1)

## Database migration status

Migrations 0000–0008 (…; PM; meters + readings + triggers + trigger
events) applied cleanly to cmms_dev/cmms_test/cmms_e2e.
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
