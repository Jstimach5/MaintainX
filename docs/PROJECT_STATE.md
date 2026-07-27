# Project State

Last updated: 2026-07-27 (Phase 6 complete)

## Current phase

Phase 6 complete — work requests + portal + notifications verified
(Scenario A e2e green). Next up: Phase 7 (preventive maintenance engine,
Scenario B).

## Last completed task

Phase 6: work requests — §8 lifecycle with duplicate-conversion guard
(conditional-UPDATE claim + unique index), corrective requests from failed
inspections, per-site tokenized portal (rate-limited, anonymous photos),
requester visibility rules, notification adapter (in-app + SMTP stub) with
badge and page; 10 new vitest + 5 new e2e (Scenario A).

## Current task

Begin Phase 7: preventive maintenance — pm_plans/pm_occurrences schema,
generation function with unique occurrence keys, fixed vs floating
recurrence in org timezone (DST-safe), horizon + advance windows, pg-boss
scheduled job + lazy tick, pause/resume, upcoming preview, Scenario B e2e
with double-run duplicate test.

## Next three tasks

1. Phase 7: preventive maintenance engine (Scenario B).
2. Phase 8: meters + readings + triggers (Scenario C).
3. Phase 9: manager progress view + reporting core.

## Known failures

None. All suites green (85 vitest, 33 playwright).

## Current test results

- `npm test`: 85/85 pass (…, procedures, requests, notifications)
- `npm run test:e2e`: 33/33 pass (desktop + mobile projects)
- `npm run build && typecheck && lint`: clean
- Prod-mode /setup door: verified by hand both directions (TEST_LOG Phase 1)

## Database migration status

Migrations 0000–0006 (…; procedures; work requests + notifications +
site portal tokens + nullable attachment uploader) applied cleanly to
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
