# Project State

Last updated: 2026-07-27 (Phase 4 complete)

## Current phase

Phase 4 complete — work orders core verified end to end (lifecycle,
assignments, Scenario-F boundaries, labor, comments, photos, org-timezone
datetimes). Next up: Phase 5 (procedures).

## Last completed task

Phase 4: work orders — §7 schema (28 cols) + assignments/assets/status-
history/labor/comments tables, lifecycle service with first-start/completion
timestamp semantics, canActOnWorkOrder boundaries, org-TZ datetime-local
handling (wallTimeToUtc), list with persistent filters, detail page with
quick-status bar + activity, asset work-history panel; 16 new vitest + 6
new e2e tests.

## Current task

Begin Phase 5: procedures — template builder (all §7 step types,
conditional follow-ups, min/max), versioned snapshot on attach, technician
step-through UI, completion blocking, failed-inspection flow.

## Next three tasks

1. Phase 5: procedures (templates, versioned snapshots, execution UI).
2. Phase 6: work requests + portal + notifications (Scenario A).
3. Phase 7: preventive maintenance engine (Scenario B).

## Known failures

None. All suites green (62 vitest, 23 playwright).

## Current test results

- `npm test`: 62/62 pass (auth, sites/locations, assets, attachments, WOs)
- `npm run test:e2e`: 23/23 pass (desktop + mobile projects)
- `npm run build && typecheck && lint`: clean
- Prod-mode /setup door: verified by hand both directions (TEST_LOG Phase 1)

## Database migration status

Migrations 0000–0004 (…; assets/attachments; work orders + assignments/
assets/status-history/labor/comments) applied cleanly to
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
