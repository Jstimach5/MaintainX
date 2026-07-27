# Project State

Last updated: 2026-07-27 (Phase 13 complete — project done)

## Current phase

Phase 13 complete. The definition-of-done sweep (§23) passed on a clean
database and the final delivery report is written (DELIVERY_REPORT.md).
Every P0 and P1 feature in FEATURE_MATRIX.md is **Verified** with recorded
evidence in TEST_LOG.md. Remaining work is the deliberately deferred P2
set (parts/inventory and friends — see DECISIONS.md #4).

## Last completed task

Phase 13: fresh `cmms_final` DB → migrate → seed → build → typecheck →
lint → worker boot (idempotent PM catch-up verified) → 139/139 unit →
61/61 e2e (Scenarios A–F) → delivery report + final doc updates.

## Current task

None — delivered. Next engagement starts with the P2 backlog or operator
feedback from real use.

## Next three tasks

1. (P2, when wanted) Parts/inventory module on the documented extension
   points.
2. (Ops) First real deployment via docker compose; smoke-test compose on
   the target host (daemon was unavailable in the build sandbox).
3. (Ops) Point `scripts/backup.sh` at a cron schedule on the host.

## Known failures

None. All suites green.

## Current test results (final sweep, clean DB — TEST_LOG Phase 13)

- `npm test`: **139/139** pass (12 files)
- `npm run test:e2e`: **61/61** pass — Scenarios A–F all green
- `npm run build` / `typecheck` / `lint`: clean
- Worker on a cold clean DB: starts, catches up PM exactly once, stops
  gracefully
- Backup → restore: executed with identical row counts (Phase 11)
- Prod-mode /setup door: verified by hand both directions (Phase 1)

## Database migration status

Migrations 0000–0010 apply cleanly to a fresh database (verified against
`cmms_final` in the Phase 13 sweep). Dev DBs in this sandbox:
cmms_dev / cmms_test / cmms_e2e on local Postgres 16.

## Manual testing status

Technician, manager, requester, and anonymous-portal flows all driven
through the real UI (desktop + Pixel 7 viewport) by the Playwright suite;
prod-build behavior spot-checked by hand (setup door, file serving).

## Important design decisions

See DECISIONS.md: #1 stack (Next.js + TS + Postgres + Drizzle + pg-boss),
#2 dev-vs-deploy DB, #3 hand-rolled sessions with revocation, #4
parts-module extension points (deferred), #5 org-timezone calendar rules,
#6 idempotency via DB constraints.

## Exact command needed to resume

```bash
cd /home/user/MaintainX
service postgresql start   # sandbox only; real deployments use docker compose
npm install
npm run db:migrate && npm run dev
# background jobs: npm run worker
# checks: npm run typecheck && npm run lint && npm test && npm run test:e2e
```
