# Project State

Last updated: 2026-07-29 (M2 complete + admin settings; suite 159 unit / 88 e2e)

## Current phase

**Mobile field application, M2 complete.** The office CMMS is complete
(Phases 0–14; see FEATURE_MATRIX.md — every P0/P1 row Verified). A new
specification asks for a true mobile field interface on the same backend:
field-first navigation, full on-phone work execution, offline capture with
safe synchronization, PWA install, secure remote access. Plan and audit:
docs/MOBILE_IMPLEMENTATION_PLAN.md, docs/MOBILE_AUDIT.md; progress tracked
in docs/MOBILE_FEATURE_MATRIX.md and docs/MOBILE_TEST_LOG.md.

## Last completed task

M1+M2 close-out: field shell (bottom nav, field home, sticky action bar),
paused/waiting_approval lifecycle with required reasons, optional
completion approval with the /admin/settings screen, labor timer, the
Windows test-run guide (docs/TEST_RUN.md), and a real product fix — same-
page form actions no longer redirect to their own route (second
submissions were silently dropped); forms reset via server-computed keys.

## Current task

None in flight — M3 is next.

## Next three tasks

1. M3 — work-list field filters, sort, requirement badges, in-app QR
   scanner.
2. M4 — mobile procedures: sectioned UI, step photos, warn ranges, drawn
   signatures.
3. M5 — required picture categories gate + request polish.

## Known failures

None outstanding. The M1/M2 cycle surfaced and fixed a real dispatch-drop
bug in same-page form actions (see MOBILE_TEST_LOG close-out entry).

## Current test results (2026-07-29)

- `npm test`: **159/159** pass (14 files)
- `npx playwright test`: **88/88** pass — desktop, Pixel 7, iPhone 14,
  Galaxy S8, iPad Mini projects
- `npm run build` / `typecheck` / `lint`: clean
- Migrations 0000–0012 replay cleanly onto freshly created databases

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
