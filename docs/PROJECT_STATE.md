# Project State

Last updated: 2026-07-27 (Phase 7 complete)

## Current phase

Phase 7 complete — PM engine verified (Scenario B e2e green; idempotent
generation, fixed/floating, catch-up collapse, crash repair). Next up:
Phase 8 (meters + triggers, Scenario C).

## Last completed task

Phase 7: preventive maintenance — pm_plans + pm_occurrences (UNIQUE
plan+key = idempotency), DST-safe recurrence lib, fixed vs floating
semantics, lead windows, one-catch-up collapse, orphan repair, procedure
auto-attach, worker cron + Run-now, plan pages with projection preview and
history; 16 new vitest + 4 new e2e (Scenario B).

## Current task

Begin Phase 8: meters — schema (meters, readings, triggers with
last-fired watermarks), manual readings + validation + correction w/
audit, trend display, threshold/interval triggers generating exactly one
WO, PM-by-usage hook, Scenario C e2e.

## Next three tasks

1. Phase 8: meters + readings + triggers (Scenario C).
2. Phase 9: manager progress view + reporting core.
3. Phase 10: bulk CSV/XLSX imports (Scenario D).

## Known failures

None. All suites green (101 vitest, 37 playwright).

## Current test results

- `npm test`: 101/101 pass (…, requests, notifications, PM engine)
- `npm run test:e2e`: 37/37 pass (desktop + mobile projects)
- `npm run build && typecheck && lint`: clean
- Prod-mode /setup door: verified by hand both directions (TEST_LOG Phase 1)

## Database migration status

Migrations 0000–0007 (…; work requests/notifications; pm_plans +
pm_occurrences + WO pm_plan_id) applied cleanly to
cmms_dev/cmms_test/cmms_e2e.
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
