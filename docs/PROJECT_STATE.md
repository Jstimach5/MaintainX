# Project State

Last updated: 2026-07-27 (Phase 1 complete)

## Current phase

Phase 1 complete — auth, RBAC, users/teams, audit plumbing all verified.
Next up: Phase 2 (sites + nested locations).

## Last completed task

Phase 1: session auth (scrypt + DB tokens with sha256-at-rest), four roles,
requireRole()/assertRole() guard pattern, first-run /setup door (verified in
prod mode both directions), users/teams admin UI, deactivation + password
reset revoke sessions in-transaction, append-only audit plumbing.

## Current task

Begin Phase 2: sites + nested locations (schema, services with archival
rules, CRUD UI, list/filter primitives to be reused app-wide).

## Next three tasks

1. Phase 2: sites + nested locations CRUD with archival rules.
2. Phase 3: assets with status/location history, storage adapter, pictures,
   QR values.
3. Phase 4: work orders core (fields, numbering, statuses + history,
   assignments, comments, attachments, mobile cards).

## Known failures

None. All suites green (18 vitest, 6 playwright).

## Current test results

- `npm test`: 18/18 pass (scrypt, sessions, revocation, admin guards, audit)
- `npm run test:e2e`: 6/6 pass (desktop + mobile projects)
- `npm run build && typecheck && lint`: clean
- Prod-mode /setup door: verified by hand both directions (TEST_LOG Phase 1)

## Database migration status

Migrations 0000 (org_settings) + 0001 (users, sessions, teams, team_members,
audit_events) applied cleanly to cmms_dev/cmms_test/cmms_e2e.
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
