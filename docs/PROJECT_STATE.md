# Project State

Last updated: 2026-07-28 (M0 — mobile field application, in progress)

## Current phase

**Mobile field application, phase M0.** The office CMMS is complete
(Phases 0–14; see FEATURE_MATRIX.md — every P0/P1 row Verified). A new
specification asks for a true mobile field interface on the same backend:
field-first navigation, full on-phone work execution, offline capture with
safe synchronization, PWA install, secure remote access. Plan and audit:
docs/MOBILE_IMPLEMENTATION_PLAN.md, docs/MOBILE_AUDIT.md; progress tracked
in docs/MOBILE_FEATURE_MATRIX.md and docs/MOBILE_TEST_LOG.md.

## Last completed task

Phase 14: technician calendar on /schedule (server-scoped to own work),
`work_order_parts` usage + cost documentation, meter readings from the
work-order page, docs/MOBILE_WORKFLOW.md methodology.

## Current task

M0 — land Phase 14 (e2e suite re-running after test-expectation fixes),
write the mobile documentation set, add iPhone / small-Android / tablet
Playwright viewport projects with a read-only `@field` layout spec.

## Next three tasks

1. M1 — field shell: bottom navigation, field home screen, sticky
   work-order action bar.
2. M2 — lifecycle + time: `paused`/`waiting_approval` statuses, pause and
   hold reasons, manager return/approval, labor timer.
3. M3 — work-list field filters, sort, requirement badges, in-app QR
   scanner.

## Known failures

None outstanding. Phase 14's first e2e run surfaced three stale test
expectations (technician /schedule now permitted; fixture display-name
drift; a calendar assertion on a work order with no due date) — all three
corrected; confirming run in progress.

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
