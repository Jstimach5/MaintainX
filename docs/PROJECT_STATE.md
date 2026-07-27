# Project State

Last updated: 2026-07-27 (Phase 5 complete)

## Current phase

Phase 5 complete — procedures verified (immutable versions, snapshots,
step-through UI, completion gate, failure flags). Next up: Phase 6 (work
requests + portal + notifications, incl. corrective-request wiring).

## Last completed task

Phase 5: procedures — templates + immutable versions (JSONB steps),
per-WO snapshots at attach time, all §7 step types with conditional
visibility and failure responses, response upserts with per-type
validation, WO completion gate, failed-inspection flag + required comment,
builder UI + step-through panel; 13 new vitest + 5 new e2e tests.

## Current task

Begin Phase 6: work requests — schema + statuses, authenticated requester
flow, per-site public portal (tokenized, rate-limited), manager review/
approve/decline/convert with duplicate-conversion guard, request↔WO links,
in-app notifications adapter, corrective-request creation from failed
inspection steps. Scenario A e2e.

## Next three tasks

1. Phase 6: work requests + portal + notifications (Scenario A).
2. Phase 7: preventive maintenance engine (Scenario B).
3. Phase 8: meters + readings + triggers (Scenario C).

## Known failures

None. All suites green (75 vitest, 28 playwright).

## Current test results

- `npm test`: 75/75 pass (auth, sites, assets, attachments, WOs, procedures)
- `npm run test:e2e`: 28/28 pass (desktop + mobile projects)
- `npm run build && typecheck && lint`: clean
- Prod-mode /setup door: verified by hand both directions (TEST_LOG Phase 1)

## Database migration status

Migrations 0000–0005 (…; work orders; procedures + versions/instances/
responses + WO flagged column) applied cleanly to
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
