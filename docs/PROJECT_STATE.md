# Project State

Last updated: 2026-07-27 (Phase 3 complete)

## Current phase

Phase 3 complete — assets with status/location histories, storage adapter
+ uploads, QR labels all verified. Next up: Phase 4 (work orders core).

## Last completed task

Phase 3: assets — full §6 field set, auto asset numbers, sub-asset
hierarchy with cycle guard, status + location histories (in-tx with audit),
archive/restore, storage adapter with validated uploads + auth-gated
serving, shared AttachmentSection UI, QR tokens + printable labels +
/a/<token> resolver; 19 new vitest + 6 new e2e tests.

## Current task

Begin Phase 4: work orders core — schema (§7 fields, numbering, status
history, assignments, multi-asset), lifecycle service, list/detail UI with
quick actions, comments, attachments reuse, labor time.

## Next three tasks

1. Phase 4: work orders core (fields, numbering, statuses + history,
   assignments, comments, attachments, mobile cards).
2. Phase 5: procedures (templates, versioned snapshots, execution UI).
3. Phase 6: work requests + portal + notifications (Scenario A).

## Known failures

None. All suites green (46 vitest, 17 playwright).

## Current test results

- `npm test`: 46/46 pass (auth, sites/locations, assets, attachments)
- `npm run test:e2e`: 17/17 pass (desktop + mobile projects)
- `npm run build && typecheck && lint`: clean
- Prod-mode /setup door: verified by hand both directions (TEST_LOG Phase 1)

## Database migration status

Migrations 0000–0003 (org_settings; users/sessions/teams/audit; sites/
locations; assets/attachments/histories) applied cleanly to
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
