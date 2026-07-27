# Project State

Last updated: 2026-07-27 (Phase 8 complete)

## Current phase

Phase 8 complete — meters + triggers verified (Scenario C e2e green;
exactly-once firing, corrections with audit). Next up: Phase 9 (manager
progress view + reporting core).

## Last completed task

Phase 8: meters — readings with monotonic/rollover/magnitude validation,
void-and-replace corrections (audited, recompute current), threshold
triggers (crossing + re-arm + skip-while-open), interval triggers
(watermark + collapse), exactly-once via UNIQUE(trigger,reading), meter
pages with reading entry/history/trigger management; 11 new vitest + 4 new
e2e (Scenario C).

## Current task

Begin Phase 9: manager progress view + reporting core — §11 table view
with full filter set and warning panel; §13 reports with KPI definitions,
CSV export, drill-down; dashboard with real counts.

## Next three tasks

1. Phase 9: manager progress view + reporting core.
2. Phase 10: bulk CSV/XLSX imports (Scenario D).
3. Phase 11: audit browser + backups + mobile pass + seed data.

## Known failures

None. All suites green (112 vitest, 41 playwright).

## Current test results

- `npm test`: 112/112 pass (…, PM engine, meters/triggers)
- `npm run test:e2e`: 41/41 pass (desktop + mobile projects)
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
