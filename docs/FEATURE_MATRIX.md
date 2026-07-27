# Feature Matrix

Statuses: Working · Partially working · Broken · Missing · Deferred · Blocked · Verified

**Verified requires recorded test evidence in TEST_LOG.md — code existing is not verification.**

Last updated: 2026-07-27 (Phase 3)

## P0 — Must work

| Feature | Priority | Status | Relevant files | Required work | Acceptance test | Last test result | Evidence |
|---|---|---|---|---|---|---|---|
| Project scaffold (build/typecheck/lint/migrations on clean DB) | P0 | Verified | package.json, next.config.ts, drizzle/, src/server/db/ | — | `npm run build && npm run typecheck && npm run lint && npm run db:migrate` all succeed on clean DB | PASS 2026-07-27 | TEST_LOG.md Phase 0 |
| Authentication (sessions, scrypt, expiry) | P0 | Verified | src/server/auth/{password,session,guards}.ts, src/app/(auth)/login, src/app/setup | — | Login/logout/expiry e2e; wrong password rejected | PASS 2026-07-27 (18 unit + 6 e2e) | TEST_LOG.md Phase 1 |
| Roles + backend permissions (admin/manager/technician/requester) | P0 | Partially working | src/server/auth/guards.ts | Guard pattern + admin-page enforcement verified; full role×action matrix grows with each module (Scenario F in Phase 12) | Vitest permission matrix; Scenario F | PASS for auth/admin surfaces 2026-07-27 | TEST_LOG.md Phase 1 |
| Users & teams admin (deactivation revokes sessions) | P0 | Verified | src/app/(app)/admin/{users,teams}, src/server/services/{users,teams}.ts | — | Deactivated user's live session rejected immediately; last-admin guards | PASS 2026-07-27 | TEST_LOG.md Phase 1 |
| Sites | P0 | Verified | src/app/(app)/sites, src/server/services/sites.ts | — | CRUD via UI; archival cascades + blocks new references | PASS 2026-07-27 | TEST_LOG.md Phase 2 |
| Nested locations (parent/child, history-safe archival) | P0 | Verified | src/server/services/locations.ts, src/app/(app)/locations | — | Tree CRUD via UI; cycle-safe re-parenting; archive cascades | PASS 2026-07-27 | TEST_LOG.md Phase 2 |
| Assets (full field set, parent/sub-assets, statuses) | P0 | Verified | src/app/(app)/assets, src/server/services/assets.ts | — | Create/edit/archive via UI; sub-assets + cycle guard | PASS 2026-07-27 | TEST_LOG.md Phase 3 |
| Asset location history + transfers | P0 | Verified | src/server/services/assets.ts (transferAsset) | — | Transfer writes history + audit; panel shows it | PASS 2026-07-27 | TEST_LOG.md Phase 3 |
| Asset status history | P0 | Verified | src/server/services/assets.ts (changeAssetStatus) | — | Status change writes history + audit; panel shows it | PASS 2026-07-27 | TEST_LOG.md Phase 3 |
| Work orders (fields, numbering, lifecycle statuses + history) | P0 | Missing | src/app/work-orders/ (planned) | Build in Phase 4 | Full lifecycle via UI; status history complete with user+timestamp | — | — |
| WO assignments (users/team) | P0 | Missing | (planned) | Build in Phase 4 | Assign/unassign; technician sees assigned work | — | — |
| Pictures & files on WOs/assets/requests (survive restart) | P0 | Partially working | src/server/storage/, src/server/services/attachments.ts, src/app/api/attachments, src/app/files/[id] | Asset uploads verified (incl. mobile + reload + disk roundtrip); WO/request wiring in Phases 4/6 | Upload via mobile viewport; picture visible after reload/restart | Asset path PASS 2026-07-27 | TEST_LOG.md Phase 3 |
| Procedures (templates, versioned snapshots, all step types) | P0 | Missing | src/app/procedures/ (planned) | Build in Phase 5 | Template edit never mutates completed WO's procedure; required steps block completion | — | — |
| Failed inspection → flag + corrective request | P0 | Missing | (planned) | Build in Phase 5 | Fail a step → WO flagged, corrective request created | — | — |
| Work requests + approval + convert (no duplicate conversion) | P0 | Missing | src/app/requests/ (planned) | Build in Phase 6 | Scenario A end-to-end | — | — |
| Public request portal (per-site, rate-limited) | P0 | Missing | src/app/portal/ (planned) | Build in Phase 6 | Submit without account; no internal data exposed | — | — |
| In-app notifications (adapter for email later) | P0 | Missing | (planned) | Build in Phase 6 | Request lifecycle notifications appear | — | — |
| Preventive maintenance generation (idempotent, fixed+floating) | P0 | Missing | src/server/jobs/ (planned) | Build in Phase 7 | Scenario B; double-run creates no duplicates | — | — |
| Meter readings + validation + correction w/ audit | P0 | Missing | src/app/meters/ (planned) | Build in Phase 8 | Reading history + trend; impossible readings rejected | — | — |
| Meter-triggered WOs (exactly once) | P0 | Missing | (planned) | Build in Phase 8 | Scenario C; reprocessing creates no duplicate | — | — |
| Manager progress view (filters + warnings) | P0 | Missing | src/app/schedule/ (planned) | Build in Phase 9 | All §11 filters work; warning set renders | — | — |
| Bulk WO import (CSV/XLSX, ≥10k rows, dry-run, idempotent) | P0 | Missing | src/app/imports/ (planned) | Build in Phase 10 | Scenario D; 10k-row background import test | — | — |
| Basic reporting (§13 list, CSV export, KPI tests) | P0 | Missing | src/app/reports/ (planned) | Build in Phase 9 | Reports agree with seeded records; canceled ≠ completed | — | — |
| Audit logging (append-only, admin browser) | P0 | Partially working | src/server/services/audit.ts | Plumbing live (user/team/org actions write events in-tx); admin browser in Phase 11 | Every §14 action writes an event; not editable in app | Plumbing PASS 2026-07-27 | TEST_LOG.md Phase 1 |
| Mobile usability (technician flows on phone-sized browser) | P0 | Missing | all UI | Continuous; pass in Phase 11 | Playwright mobile project on technician flows | — | — |
| Reliable database migrations | P0 | Partially working | drizzle/, src/server/db/migrate.ts | Prove on clean DB every phase | Clean-DB migrate in TEST_LOG each phase | pending | — |
| Backups (documented + scripted) | P0 | Missing | scripts/backup.sh (planned) | Build in Phase 11 | Backup + restore actually executed and logged | — | — |

## P1 — Required before final completion

| Feature | Priority | Status | Relevant files | Required work | Acceptance test | Last test result | Evidence |
|---|---|---|---|---|---|---|---|
| Timeline + calendar views | P1 | Missing | src/app/schedule/ (planned) | Phase 12 | Grouped views render; overdue/conflicts visible | — | — |
| Downtime planning (planned/actual, conflicts) | P1 | Missing | (planned) | Phase 12 | Scenario E | — | — |
| Corrective WOs from failed inspections (auto, configured) | P1 | Missing | (planned) | Phase 12 | Configured failure creates corrective WO linked back | — | — |
| Saved reporting filters / dashboards | P1 | Missing | (planned) | Phase 12 | Save + reload a dashboard; share internal link | — | — |
| PDF / print-friendly reporting | P1 | Missing | (planned) | Phase 12 | Print stylesheet output readable | — | — |
| QR-code asset access (scan → asset page / request form) | P1 | Partially working | src/app/(app)/assets/[id]/label, src/app/a/[token] | Label + authenticated scan verified; public limited request flow in Phase 12 | Scan URL opens asset page; unauthenticated scan → limited request page | Label+resolver PASS 2026-07-27 | TEST_LOG.md Phase 3 |
| Import rollback where safe | P1 | Missing | (planned) | Phase 10 basic, Phase 12 polish | Rollback removes only import-created rows; refused after external edits | — | — |
| Notifications completeness (mentions, all §8 events) | P1 | Missing | (planned) | Phase 12 | Each §8 event notifies the right users | — | — |
| E2E coverage of critical workflows (Scenarios A–F) | P1 | Missing | e2e/ | Built per phase; all green Phase 12 | `npm run test:e2e` green | — | — |
| Deployment + admin documentation | P1 | Partially working | docs/, docker-compose.yml | Finalize Phase 12 | Docs match reality; commands verified | — | — |

## P2 — Deferred (do not build now)

| Feature | Status |
|---|---|
| Parts inventory | Deferred — extension points documented in DECISIONS.md |
| Purchase orders | Deferred |
| Vendor management | Deferred |
| IoT integrations | Deferred — meter reading `source` field is the adapter seam |
| Advanced workforce optimization | Deferred |
| AI summaries / AI procedure generation | Deferred |
| Native mobile applications | Deferred |
| Enterprise SSO | Deferred |
| Complex multi-organization management | Deferred (single-org schema with org_settings singleton) |
