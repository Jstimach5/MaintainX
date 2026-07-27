# Project State

Last updated: 2026-07-27 (Phase 2 complete)

## Current phase

Phase 2 complete — sites + nested locations verified (tree, cycles,
archive cascades, role boundaries). Next up: Phase 3 (assets).

## Last completed task

Phase 2: sites + nested locations — services with cycle prevention and
archive cascades, admin CRUD UI with location tree, read-only views for
manager/technician, requester blocked; 9 new vitest + 5 new e2e tests.

## Current task

Begin Phase 3: assets — schema (full §6 field set, parent/sub-assets,
status/location history tables), storage adapter + picture uploads, QR
values, asset pages with history panels.

## Next three tasks

1. Phase 3: assets with status/location history, storage adapter, pictures,
   QR values.
2. Phase 4: work orders core (fields, numbering, statuses + history,
   assignments, comments, attachments, mobile cards).
3. Phase 5: procedures (templates, versioned snapshots, execution UI).

## Known failures

None. All suites green (27 vitest, 11 playwright).

## Current test results

- `npm test`: 27/27 pass (auth, sessions, guards, audit, sites, locations)
- `npm run test:e2e`: 11/11 pass (desktop + mobile projects)
- `npm run build && typecheck && lint`: clean
- Prod-mode /setup door: verified by hand both directions (TEST_LOG Phase 1)

## Database migration status

Migrations 0000–0002 (org_settings; users/sessions/teams/audit; sites/
locations) applied cleanly to cmms_dev/cmms_test/cmms_e2e.
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
