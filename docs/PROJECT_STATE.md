# Project State

Last updated: 2026-07-27 (Phase 0 in progress)

## Current phase

Phase 0 — Foundation scaffold + self-tracking docs.

## Last completed task

Repository audit (empty repo — see CURRENT_STATE_AUDIT.md); stack selection
(DECISIONS.md #1); dependency install with exact version pins; Postgres
dev/test databases created in the sandbox (`cmms_dev`, `cmms_test`).

## Current task

Verify the scaffold: generate + apply the initial migration (org_settings),
`npm run build`, `npm run typecheck`, `npm run lint`, dev-server smoke check;
record results in TEST_LOG.md; commit and push Phase 0.

## Next three tasks

1. Phase 1: sessions + scrypt auth, four roles, requireRole() guards, audit
   plumbing, users/teams admin, permission-matrix unit tests, login e2e.
2. Phase 2: sites + nested locations CRUD with archival rules.
3. Phase 3: assets with status/location history, storage adapter, pictures.

## Known failures

None yet (nothing verified yet either — see FEATURE_MATRIX.md).

## Current test results

No test runs recorded yet. TEST_LOG.md is empty pending the Phase 0
verification pass.

## Database migration status

Schema defined for `org_settings` only. Initial migration not yet generated.
Dev DB: postgres://cmms@localhost:5432/cmms_dev (sandbox local Postgres 16).

## Manual testing status

Not started.

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
