# Feature Matrix

Statuses: Working · Partially working · Broken · Missing · Deferred · Blocked · Verified

**Verified requires recorded test evidence in TEST_LOG.md — code existing is not verification.**

Last updated: 2026-07-27 (Phase 11)

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
| Work orders (fields, numbering, lifecycle statuses + history) | P0 | Verified | src/app/(app)/work-orders, src/server/services/workOrders.ts | — | Full lifecycle via UI; status history complete with user+timestamp | PASS 2026-07-27 | TEST_LOG.md Phase 4 |
| WO assignments (users/team) | P0 | Verified | src/server/services/workOrders.ts | — | Assign/unassign; tech sees Mine filter; Scenario-F boundaries enforced | PASS 2026-07-27 | TEST_LOG.md Phase 4 |
| Pictures & files on WOs/assets/requests (survive restart) | P0 | Verified | src/server/storage/, src/server/services/attachments.ts | — | Upload via mobile viewport; survives reload; requester scoping enforced; portal uploads anonymous | PASS 2026-07-27 | TEST_LOG.md Phases 3–6 |
| Procedures (templates, versioned snapshots, all step types) | P0 | Verified | src/app/(app)/procedures, src/server/services/procedures.ts | — | Template edit never mutates completed WO's procedure; required steps block completion | PASS 2026-07-27 | TEST_LOG.md Phase 5 |
| Failed inspection → flag + corrective request | P0 | Verified | src/server/services/{procedures,requests}.ts | — | Fail a step → WO flagged, corrective request created exactly once | PASS 2026-07-27 | TEST_LOG.md Phases 5–6 |
| Work requests + approval + convert (no duplicate conversion) | P0 | Verified | src/app/(app)/requests, src/server/services/requests.ts | — | Scenario A end-to-end | PASS 2026-07-27 | TEST_LOG.md Phase 6 |
| Public request portal (per-site, rate-limited) | P0 | Verified | src/app/portal/[token] | — | Submit without account (w/ photo); no internal data exposed; 5/hr/IP limit | PASS 2026-07-27 | TEST_LOG.md Phase 6 |
| In-app notifications (adapter for email later) | P0 | Verified | src/server/services/notifications.ts, src/app/(app)/notifications | — | Request lifecycle notifications appear (badge + page); email stub behind SMTP_URL | PASS 2026-07-27 | TEST_LOG.md Phase 6 |
| Preventive maintenance generation (idempotent, fixed+floating) | P0 | Verified | src/server/services/pm.ts, src/app/(app)/pm-plans, src/worker | — | Scenario B; double-run creates no duplicates (unique occurrence keys) | PASS 2026-07-27 | TEST_LOG.md Phase 7 |
| Meter readings + validation + correction w/ audit | P0 | Verified | src/app/(app)/meters, src/server/services/meters.ts | — | Reading history; impossible/decreasing readings rejected; corrections audited | PASS 2026-07-27 | TEST_LOG.md Phase 8 |
| Meter-triggered WOs (exactly once) | P0 | Verified | src/server/services/meters.ts (evaluateTriggers) | — | Scenario C; reprocessing creates no duplicate (unique trigger+reading) | PASS 2026-07-27 | TEST_LOG.md Phase 8 |
| Manager progress view (filters + warnings) | P0 | Verified | src/app/(app)/schedule, src/server/services/reports.ts (managerWarnings) | — | §11 filters work; warning set renders and links | PASS 2026-07-27 | TEST_LOG.md Phase 9 |
| Bulk WO import (CSV/XLSX, ≥10k rows, dry-run, idempotent) | P0 | Verified | src/app/(app)/imports, src/server/services/imports.ts | — | Scenario D e2e; 10k-row import test green; rollback safe | PASS 2026-07-27 | TEST_LOG.md Phase 10 |
| Basic reporting (§13 list, CSV export, KPI tests) | P0 | Verified | src/app/(app)/reports, src/server/services/reports.ts | — | Reports agree with records; canceled ≠ completed unit-tested; CSV sanitized | PASS 2026-07-27 | TEST_LOG.md Phase 9 |
| Audit logging (append-only, admin browser) | P0 | Verified | src/server/services/audit.ts, src/app/(app)/admin/audit | — | Every §14 action writes an event; browser filters; no edit path exists | PASS 2026-07-27 | TEST_LOG.md Phases 1–11 |
| Mobile usability (technician flows on phone-sized browser) | P0 | Verified | all UI (@mobile Playwright project) | — | Mobile e2e: login, photo upload, WO flow, request submit, schedule — no horizontal scroll | PASS 2026-07-27 | TEST_LOG.md Phases 1–11 |
| Reliable database migrations | P0 | Verified | drizzle/ (0000–0009), src/server/db/migrate.ts | — | Clean-DB migrate + seed executed and verified | PASS 2026-07-27 | TEST_LOG.md Phase 11 |
| Backups (documented + scripted) | P0 | Verified | scripts/backup.sh, docs/BACKUP_AND_RESTORE.md | — | Backup + restore executed with matching row counts | PASS 2026-07-27 | TEST_LOG.md Phase 11 |

## P1 — Required before final completion

| Feature | Priority | Status | Relevant files | Required work | Acceptance test | Last test result | Evidence |
|---|---|---|---|---|---|---|---|
| Timeline + calendar views | P1 | Missing | src/app/schedule/ (planned) | Phase 12 | Grouped views render; overdue/conflicts visible | — | — |
| Downtime planning (planned/actual, conflicts) | P1 | Missing | (planned) | Phase 12 | Scenario E | — | — |
| Corrective WOs from failed inspections (auto, configured) | P1 | Missing | (planned) | Phase 12 | Configured failure creates corrective WO linked back | — | — |
| Saved reporting filters / dashboards | P1 | Missing | (planned) | Phase 12 | Save + reload a dashboard; share internal link | — | — |
| PDF / print-friendly reporting | P1 | Missing | (planned) | Phase 12 | Print stylesheet output readable | — | — |
| QR-code asset access (scan → asset page / request form) | P1 | Partially working | src/app/(app)/assets/[id]/label, src/app/a/[token] | Label + authenticated scan verified; public limited request flow in Phase 12 | Scan URL opens asset page; unauthenticated scan → limited request page | Label+resolver PASS 2026-07-27 | TEST_LOG.md Phase 3 |
| Import rollback where safe | P1 | Verified | src/server/services/imports.ts (rollbackImport) | — | Rollback removes only untouched import-created WOs; touched ones kept + reported | PASS 2026-07-27 | TEST_LOG.md Phase 10 |
| Notifications completeness (mentions, all §8 events) | P1 | Missing | (planned) | Phase 12 | Each §8 event notifies the right users | — | — |
| E2E coverage of critical workflows (Scenarios A–F) | P1 | Missing | e2e/ | Built per phase; all green Phase 12 | `npm run test:e2e` green | — | — |
| Deployment + admin documentation | P1 | Verified | docs/DEPLOYMENT.md, ADMIN_GUIDE.md, USER_GUIDE.md, BACKUP_AND_RESTORE.md | — | Docs written against the real commands used in TEST_LOG | PASS 2026-07-27 | TEST_LOG.md Phase 11 |

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
