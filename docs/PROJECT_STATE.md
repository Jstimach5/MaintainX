# Project State

Last updated: 2026-07-29 (production launch cycle; suite 186 unit / 95 e2e)

## Current phase

**Production launch cycle (P0–P6).** Mobile M2 is complete; The office CMMS is complete
(Phases 0–14; see FEATURE_MATRIX.md — every P0/P1 row Verified). A new
specification asks for a true mobile field interface on the same backend:
field-first navigation, full on-phone work execution, offline capture with
safe synchronization, PWA install, secure remote access. Plan and audit:
docs/MOBILE_IMPLEMENTATION_PLAN.md, docs/MOBILE_AUDIT.md; progress tracked
in docs/MOBILE_FEATURE_MATRIX.md and docs/MOBILE_TEST_LOG.md.

## Last completed task

Production launch P0–P5: the silent-gitignore fix that was excluding the
storage module from every clone; invitations with hashed one-shot tokens
+ admin UI + public acceptance; real SMTP email adapter with honest dev
mode; self-serve password reset + forced first-login change; production
compose (Caddy auto-HTTPS, non-root image, health endpoint, seed guard);
prod backups with retention; migration/clean-clone/backup-restore gates —
the clean-clone gate caught and fixed a build-time DB-connection bug that
would have broken every docker image build.

## Current task

P6 — final launch docs, the consolidated operator-credentials list, and
the go-live report. Deployment itself waits on the operator's VPS/domain/
SMTP credentials.

## Next three tasks

1. Operator provides VPS + domain + SMTP → run docs/DEPLOYMENT.md
   production section end-to-end, then §19 manual tests from a real phone
   on mobile data.
2. Production onboarding per docs/TEAM_ONBOARDING.md (§20 order).
3. Mobile roadmap resumes at M3 (docs/MOBILE_IMPLEMENTATION_PLAN.md).

## Known failures

None outstanding. The M1/M2 cycle surfaced and fixed a real dispatch-drop
bug in same-page form actions (see MOBILE_TEST_LOG close-out entry).

## Current test results (2026-07-29)

- `npm test`: **186/186** pass (17 files)
- `npx playwright test`: **95/95** pass — desktop, Pixel 7, iPhone 14,
  Galaxy S8, iPad Mini projects
- `npm run build` / `typecheck` / `lint`: clean — including
  `env -u DATABASE_URL npm run build` (the docker image-build condition)
- Migrations 0000–0013: clean empty DB (38 tables) AND populated-copy
  re-run both verified; clean-clone build + migrate + seed verified

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
