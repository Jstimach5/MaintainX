# Project State

Last updated: 2026-07-27 (Phase 12 complete)

## Current phase

Phase 12 complete — every P1 feature is now Verified (calendar/timeline,
downtime automation, corrective WOs, saved views, print reports, QR
request flow, notification completeness, Scenarios A–F green). Next up:
Phase 13 (definition-of-done sweep + §24 delivery report).

## Last completed task

Phase 12: P1 set — calendar + grouped timeline views, Scenario-E
downtime automation (manual states win), corrective sub-WOs from failed
steps, saved report views + print CSS, QR→portal flow with asset
preselect, assignment/comment notifications; 4 new vitest + 7 new e2e.

## Current task

Begin Phase 13: §23 definition-of-done sweep on a clean database and the
§24 final delivery report.

## Next three tasks

1. Phase 13: definition-of-done sweep + §24 delivery report.

## Known failures

None. All suites green (139 vitest, 61 playwright).

## Current test results

- `npm test`: 139/139 pass
- `npm run test:e2e`: 61/61 pass — Scenarios A–F all green
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
