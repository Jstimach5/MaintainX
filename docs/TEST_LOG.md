# Test Log

Every test cycle is recorded here per master prompt §18: date/time, commit or
working-tree reference, feature tested, commands run, automated result,
manual result, browser, test user role, failures found, fix applied,
evidence, final result. Newest entries at the bottom of each phase section.

Nothing in FEATURE_MATRIX.md may be marked **Verified** without an entry
here. Tests that cannot be run are recorded as **Not Tested** with a reason.

---

## Phase 0 — Foundation

### 2026-07-27 — Scaffold verification (pre-first-commit working tree)

- **Feature tested:** project scaffold — migrations on clean DB, typecheck,
  lint, production build, dev-server page render.
- **Commands run:**
  - `npx drizzle-kit generate` → produced `drizzle/0000_rare_sentinels.sql`
    (org_settings, 5 columns, singleton check)
  - `npm run db:migrate` → "Migrations complete." against fresh `cmms_dev`;
    `\dt` shows `org_settings`
  - `npm run typecheck` → clean (after fixing pg-boss v12 named-export import
    and typing the error handler in `src/worker/index.ts`)
  - `npm run lint` → clean (after rewriting `eslint.config.mjs` for
    eslint-config-next 16's native flat-config exports; FlatCompat no longer
    works with it)
  - `npm run build` → ✓ Compiled successfully; routes `/` and `/_not-found`
  - Dev-server smoke: `npm run dev` + `curl http://localhost:3000/` →
    HTTP 200, body contains "Maintenance Manager"
- **Automated test result:** n/a (no unit tests exist yet — first tests land
  in Phase 1 with auth)
- **Manual result:** pass (curl-level; browser drive starts in Phase 1)
- **Browser:** none (curl)
- **Test user role:** none (no auth yet)
- **Failures found & fixes:** (1) `import PgBoss from "pg-boss"` fails under
  pg-boss 12 → switched to named import. (2) FlatCompat +
  eslint-config-next 16 throws in config-validator → native flat config.
- **Final result:** PASS — scaffold verified end to end on a clean database.

---

## Phase 1 — Auth + RBAC + users/teams

### 2026-07-27 — Full verification cycle (working tree at Phase 1 completion)

- **Feature tested:** sessions + scrypt auth, four roles, first-run setup,
  users/teams admin, deactivation-revokes-sessions, audit plumbing.
- **Commands run:**
  - `npm run db:migrate` → applied `0001_auth_users_teams_audit.sql`
    (users, sessions, teams, team_members, audit_events + enums/indexes)
  - `npm run typecheck` → clean; `npm run lint` → clean
  - `npm test` → **18/18 passed** (vitest against clean `cmms_test`):
    scrypt roundtrip/reject/malformed-hash/param-compat, session
    create/expire/revoke, deactivation-revokes-session, password-reset-
    revokes-sessions, last-admin deactivate+demote guards, case-insensitive
    username uniqueness, one-time setup, audit event written in-tx
  - `npm run test:e2e` → **6/6 passed** (Playwright, Chromium, fresh
    `cmms_e2e` reset by the e2e:server script): first-run setup → dashboard;
    setup one-time door; wrong password rejected + login + logout with
    server-side revocation; admin creates technician via UI; technician
    blocked from /admin/users server-side (403 page) with nav link hidden;
    @mobile (Pixel 7) technician login + no horizontal scroll
  - Production-mode check (`next build` + `next start` against a scratch DB):
    /setup ↔ /login door verified in **both directions**
- **Browser:** Chromium (Playwright) desktop + Pixel 7 mobile emulation
- **Test user roles:** admin, technician
- **Failures found & fixes:**
  1. Playwright webServer starts before globalSetup → e2e DB reset moved
     into the `e2e:server` command (`e2e/reset-db.ts`).
  2. Login click flaked while React hydration was in flight → e2e helper
     waits for network idle; removed `autoFocus` from login input.
  3. `getByRole("alert")` strict-mode clash with Next's route announcer →
     FormError got `data-testid="form-error"`.
  4. **Real product bug (prod mode only):** Next 16 partially prerendered
     /setup, /login, / — the setup-door check was skipped at runtime, so
     `/setup` kept serving the form after setup was completed. Fixed with
     `export const dynamic = "force-dynamic"` on all three routes; verified
     against a production build in both DB states.
  5. Edit-user page originally passed the full user row (incl.
     password_hash) into a client component → now passes picked safe fields.
- **Final result:** PASS — all automated suites green; prod-mode door
  verified by hand.

---

## Phase 2 — Sites + nested locations

### 2026-07-27 — Full verification cycle

- **Feature tested:** sites CRUD, arbitrarily nested locations, archive
  cascades, cycle prevention, role boundaries on all pages.
- **Commands run:** `npm run db:migrate` (0002_sites_locations), `npm run
  typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`
- **Automated results:** vitest **27/27** (adds: site duplicate-name reject,
  site-archive cascades to locations, tree assembly, cross-site parent
  reject, re-parent cycle prevention (self + descendant), subtree archive
  cascade, archived-parent child reject, picker excludes archived + depth).
  Playwright **11/11** (adds: admin creates site + nested locations via UI,
  archive location via UI shows badge, technician read-only view, requester
  403 on /sites, manager 403 on /sites/new).
- **Browser:** Chromium desktop + Pixel 7 (auth mobile test still green)
- **Test user roles:** admin, manager, technician, requester
- **Failures found & fixes:** e2e submit locator matched the nav Sign-out
  button (strict mode) → scoped to `main form button[type=submit]`. TS null
  annotation in getLocationPath.
- **Final result:** PASS — all suites green.

---

## Phase 3 — Assets, histories, storage adapter, QR values

### 2026-07-27 — Full verification cycle

- **Feature tested:** asset CRUD (full §6 field set), auto/manual asset
  numbers, sub-asset hierarchy, status changes + history, location transfers
  + history, archive/restore, picture/file uploads via storage adapter,
  auth-gated file serving, QR tokens + printable label, /a/<token> resolver.
- **Commands run:** db:migrate (0003_assets_attachments), typecheck, lint,
  `npm test`, `npm run test:e2e`, build
- **Automated results:** vitest **46/46** (adds 19: asset numbering +
  duplicate reject, initial location-history entry, cross-site + archived
  location rejects, unique QR tokens, sub-asset cycle prevention, status
  history + audit + no-op dedupe + archived guard, transfer history + no-op +
  cross-site reject, list filters; attachments: file+row invariant with
  content roundtrip from disk, executable/HTML type rejection, empty-file
  reject, delete removes row+file, per-entity listing). Playwright **17/17**
  (adds 6: create asset via UI with dependent site→location select, status
  change shows history entry, photo upload appears + survives reload + served
  as image/png with 200, QR label renders, technician can change status but
  gets 403 on /assets/new, @mobile photo upload with no horizontal scroll).
- **Browser:** Chromium desktop + Pixel 7
- **Test user roles:** admin, technician
- **Failures found & fixes:** new spec filename sorted before auth.spec and
  its fixture pre-seeded users, breaking the first-run test → specs renamed
  with numeric prefixes (00-auth, 10-sites, 20-assets) for deterministic
  order.
- **Final result:** PASS — all suites green.

---

## Phase 4 — Work orders core

### 2026-07-27 — Full verification cycle

- **Feature tested:** WO creation (§7 field set incl. planned/due datetimes,
  estimates, downtime, costs fields, tags, parent/sub-WOs, multi-asset,
  team + people assignment), sequential numbering, status lifecycle with
  history (actualStartAt stamped on first start; completedAt set/cleared),
  technician action boundaries, comments, per-tech labor entries, WO
  attachments, asset work-history panel, org-timezone datetime handling.
- **Commands run:** db:migrate (0004_work_orders), typecheck, lint,
  `npm test`, `npm run test:e2e`, build
- **Automated results:** vitest **62/62** (adds 16: numbering, initial
  status by assignment, primary-asset linking + history row, archived/
  cross-site asset rejects, lifecycle timestamps + reopen semantics + 4-row
  history, tech-cannot-cancel, Scenario-F boundaries (assigned/team/
  unassigned/manager), labor totals + range validation, comments, update
  syncs assignees/assets, self-parent reject, list filters incl. mine/asset/
  default-hides-finished). Playwright **23/23** (adds 6: manager creates WO
  from asset page with prefilled site+asset and assigns tech; tech runs the
  full job — start, photo upload, comment, 1h15m labor, complete with notes
  + downtime, history trail visible; completed WO in asset history; second
  tech blocked from another tech's WO (read-only banner, no action
  buttons); requester 403; @mobile tech start-work flow with no horizontal
  scroll).
- **Browser:** Chromium desktop + Pixel 7
- **Test user roles:** admin, manager, technician (x2), requester
- **Failures found & fixes:** (1) datetime-local inputs were being parsed in
  server timezone — added wallTimeToUtc(org tz) conversion in actions
  (DECISIONS.md #5 class bug caught in review). (2) e2e assignee locator
  referenced a fixture name that the UI-created user shadowed → locator by
  visible display name. (3) mid-test re-login hit the /login→dashboard
  redirect → login helper signs out first.
- **Final result:** PASS — all suites green.

---

## Phase 5 — Procedures

### 2026-07-27 — Full verification cycle

- **Feature tested:** procedure templates with all §7 step types (incl.
  conditional follow-ups, min/max ranges, failure responses), immutable
  versioning, per-WO snapshots, technician step-through, completion gate,
  failed-inspection flow (flag + required comment; corrective request lands
  with Phase 6 requests).
- **Commands run:** db:migrate (0005_procedures), typecheck, lint, `npm
  test`, `npm run test:e2e`, build
- **Automated results:** vitest **75/75** (adds 13: v1 create + version
  bump, forward-conditional reject, snapshot immune to template edits,
  response upsert, per-type validation, fail-requires-comment + WO flag +
  corrective request signal, out-of-range-number failure, unassigned-tech
  reject, conditional visibility truth table, completion gate incl.
  conditional reveal + checkbox-must-be-true + finished-WO reject).
  Playwright **28/28** (adds 5: manager builds a 2-step procedure in the UI,
  attaches to a WO (0/2 badge), completion blocked then unblocked through
  the real forms, failure requires comment + flags WO, template edit → v2
  leaves the completed WO's v1 snapshot untouched, technician 403 on
  /procedures).
- **Browser:** Chromium desktop + Pixel 7
- **Test user roles:** manager, technician
- **Failures found & fixes:** Playwright selectOption regex label is not
  supported → literal option label.
- **Final result:** PASS — all suites green.

---

## Phase 6 — Work requests, portal, notifications

### 2026-07-27 — Full verification cycle

- **Feature tested:** request lifecycle (§8 statuses), manager review/
  approve/decline-with-reason/convert with duplicate-conversion guard,
  request↔WO links both directions, corrective requests from failed
  inspection steps (once per step), per-site tokenized public portal with
  IP rate limiting + anonymous photo upload, requester visibility rules
  (own requests only, no internal notes), in-app notification adapter
  (submit → managers; decide/convert/complete → requester) with unread
  badge + notifications page.
- **Commands run:** db:migrate (0006_requests_notifications), typecheck,
  lint, `npm test`, `npm run test:e2e`, build
- **Automated results:** vitest **85/85** (adds 10: request numbering +
  manager notify audience, decline-requires-reason + requester notify,
  convert-requires-approval, exactly-one conversion + repeat reject +
  source/requester on the WO, WO-completion notifies requester, cross-site
  asset validation, requester-scoped listing, corrective request created
  once with high priority + origin/asset links, unread counts/mark-read,
  decided-after-converted guard). Playwright **33/33** (adds 5 — Scenario A
  end to end: requester submits w/ photo; manager notification → review →
  internal note → approve → convert → assign tech; tech completes; requester
  sees completed status w/o internal notes + completion notification;
  requester 404 on someone else's request; anonymous portal submission with
  photo lands for managers marked "portal").
- **Browser:** Chromium desktop + Pixel 7
- **Test user roles:** admin, manager, technician, requester, anonymous
- **Failures found & fixes:** upload/file-serving routes had excluded
  requesters entirely — now scoped to their own requests; attachment
  uploadedBy made nullable for anonymous portal uploads; convertRequest
  rewritten to avoid nesting transactions across pool connections
  (conditional-UPDATE claim + cancel-stray-WO on lost race).
- **Final result:** PASS — all suites green.

---

## Phase 7 — Preventive maintenance

### 2026-07-27 — Full verification cycle

- **Feature tested:** PM plans (§9) — recurrence (day/week/month/year with
  month-end clamping, DST-safe pure calendar math), fixed vs floating basis,
  lead-day advance generation, pause/resume, end dates, archived-asset skip,
  idempotent generation via UNIQUE occurrence keys, missed-occurrence
  collapse to one catch-up, crash-window repair, procedure auto-attach,
  worker cron + startup run + manual "Run scheduler now".
- **Commands run:** db:migrate (0007_pm_plans), typecheck, lint, `npm test`,
  `npm run test:e2e`, build
- **Automated results:** vitest **101/101** (adds 16: recurrence math incl.
  Jan-31→Feb-28/29 clamps + leap years + DST week-add + projection with end
  dates; exactly-one generation with idempotent re-run; lead-window before/
  inside; paused + archived-asset skips; floating no-stacking + completion
  re-anchor; fixed marching with single catch-up keeping the overdue date +
  cadence alignment; end-date stop; procedure attach + assignees on
  generated WOs; orphan-occurrence repair; preview; pause via update).
  Playwright **37/37** (adds 4 — Scenario B: manager creates weekly floating
  plan due today; Run-now generates exactly one WO, re-run still one, plan
  history shows it; technician completes → next due re-anchors a week out
  and re-run generates nothing; technician 403 on /pm-plans). Also fixed a
  flaky portal locator (route-announcer strict-mode clash).
- **Browser:** Chromium desktop + Pixel 7
- **Test user roles:** manager, technician
- **Final result:** PASS — all suites green.

---

## Phase 8 — Meters, readings, triggers

### 2026-07-27 — Full verification cycle

- **Feature tested:** meters (§10) on assets/locations, manual readings with
  monotonic validation + explicit rollover + impossible-magnitude rejection,
  corrections that void-and-replace with a required note and full audit
  trail, threshold triggers (upward-crossing fire, re-arm after dropping
  below, skip-while-open guard), interval triggers (usage-based PM with
  watermark + multi-interval collapse), exactly-once firing via UNIQUE
  (trigger, reading), generated WOs linking back to meter + asset.
- **Commands run:** db:migrate (0008_meters), typecheck, lint, `npm test`,
  `npm run test:e2e`, build
- **Automated results:** vitest **112/112** (adds 11 across readings/
  corrections/threshold/interval incl. the Scenario-C truth table:
  below-threshold silence, exactly-one WO, reprocess no-op, re-arm,
  skipIfOpen, disabled triggers, interval collapse). Playwright **41/41**
  (adds 4 — Scenario C: manager creates meter + 500h threshold trigger;
  tech's 300h reading creates nothing; 250h decreasing reading rejected;
  510h fires exactly one WO that links back to meter and asset, 520h does
  not re-fire; manager corrects 520→515 with audit note visible).
- **Browser:** Chromium desktop + Pixel 7
- **Test user roles:** manager, technician
- **Final result:** PASS — all suites green.

---

## Phase 9 — Manager progress view + reporting core

### 2026-07-27 — Full verification cycle

- **Feature tested:** /schedule manager table (§11) with status/priority/
  type/site/assignee/include-finished filters and the warnings panel
  (overdue PM, asset-still-offline-after-completion, double-downtime on
  critical assets, planned-start-after-due, archived-asset work, inactive
  assignees, unassigned indicator); /reports (§13) with KPI tiles, single-
  hue bar breakdowns, completed-by-tech/team/site, estimated-vs-actual,
  PM compliance, preventive-vs-reactive, downtime-by-asset, repeat
  failures, request stats, meter-triggered count; CSV export with formula-
  injection sanitization; real dashboard (role-aware incl. requester
  variant); meter trend line chart with hover.
- **Commands run:** typecheck, lint, `npm test`, `npm run test:e2e`, build
  (no schema changes this phase)
- **Automated results:** vitest **122/122** (adds 10 KPI-definition tests:
  canceled-never-completed across three report functions, backlog open/
  overdue/unassigned, per-tech labor aggregation, preventive-vs-reactive
  buckets, downtime sums, repeat-failure threshold, approval rate excludes
  undecided, PM compliance open→on-time transition, offline-after-
  completion fires only when all the asset's work is finished, plus
  downtime-conflict detection). Playwright **46/46** (adds 5: dashboard
  tiles, schedule filters persist + completed rows show, reports tiles +
  CSV export content-type/sections, technician 403 on schedule/reports/
  export, meter trend chart renders).
- **Browser:** Chromium desktop + Pixel 7
- **Test user roles:** manager, technician
- **Failures found & fixes:** three strict-mode locator ambiguities in the
  new spec (tile label vs heading, option element, heading prefix) —
  locators scoped/exact-matched.
- **Final result:** PASS — all suites green.

---

## Phase 10 — Bulk imports

### 2026-07-27 — Full verification cycle

- **Feature tested:** §12 import pipeline — CSV/XLSX upload + header
  detection, auto-mapping + manual column mapping + reusable templates,
  whole-file validation (status/priority/type normalization without
  guessing, date parsing incl. Excel cells, site/location/asset/user/team
  resolution by name or code, archived-record + inactive-user warnings,
  in-file and cross-DB duplicate external ids, contradiction checks,
  formula-content flagging, length limits), dry-run preview, duplicate
  strategies (skip/update/new), background processing with atomic claim +
  per-row outcomes + live progress, issues-CSV download, audit records,
  safe rollback (only untouched WOs removed).
- **Commands run:** db:migrate (0009_imports), typecheck, lint, `npm test`,
  `npm run test:e2e`, build
- **Automated results:** vitest **135/135** (adds 13, incl. the 10,000-row
  import completing with 10,000 created and idempotent re-processing;
  JSONB-date rehydration bug found by tests and fixed). Playwright
  **50/50** (adds 4 — Scenario D: upload → auto-mapped columns → validate
  shows 2 valid/2 rejected with named reasons + issues CSV; import creates
  the WOs with completion dates + import source; re-import skips both
  duplicates with zero creations; technician 403).
- **Browser:** Chromium desktop + Pixel 7
- **Test user roles:** admin, technician
- **Final result:** PASS — all suites green.

---

## Phase 11 — Audit browser, backups, seed data, mobile pass

### 2026-07-27 — Full verification cycle

- **Feature tested:** admin audit-log browser (filters by record type,
  action prefix, user, date; read-only by design), backup script + restore
  procedure, §20 seed data, sample import file, DEPLOYMENT/ADMIN_GUIDE/
  USER_GUIDE/BACKUP_AND_RESTORE docs, clean-DB migration re-verification,
  additional mobile checks.
- **Commands run:** typecheck, lint, `npm test`, `npm run test:e2e`, build,
  `npm run db:seed`, `scripts/backup.sh`, `pg_restore` into a scratch DB,
  clean-database migrate+seed (`cmms_clean`).
- **Backup/restore evidence:** seeded dev DB (7 WOs, 5 assets,
  2 attachments) dumped with pg_dump custom format; restored into scratch
  `cmms_restore`; counts identical (7/5/2); storage dir tarred alongside.
- **Clean-DB evidence:** `cmms_clean` created → migrations 0000–0009
  applied → seed loaded (7 WOs) → dropped.
- **Automated results:** vitest **135/135**; Playwright **54/54** (adds 4:
  audit browser filter by action prefix returns only matching events,
  manager 403 on /admin/audit, @mobile requester submits + tracks a
  request with no horizontal scroll, @mobile manager schedule view scrolls
  its table inside the card, not the page).
- **Browser:** Chromium desktop + Pixel 7
- **Test user roles:** admin, manager, requester
- **Final result:** PASS — all suites green; backup/restore and clean-DB
  procedures executed, not just documented.

---

## Phase 12 — P1 set

### 2026-07-27 — Full verification cycle

- **Feature tested:** calendar month view + 14-day timeline (grouped by
  site/team/assignee, downtime bars highlighted) on /schedule; downtime
  automation (start → asset planned_downtime, complete/cancel → back
  online, never overriding manually-set states); corrective work ORDERS
  from failed inspection steps (once, linked as sub-WO); saved report
  views (per-user, shareable URLs) + print/PDF stylesheet; QR scan →
  portal request form with asset preselected (staff still land on the
  asset page); notification completeness (WO assignment on create+update,
  request comments notify the other side, never internal notes).
- **Commands run:** db:migrate (0010_report_views), typecheck, lint,
  `npm test`, `npm run test:e2e`, build
- **Automated results:** vitest **139/139** (adds 4: Scenario-E service
  path incl. manual-state precedence, assignment notifications on both
  paths, corrective-WO once with parent/priority/title). Playwright
  **61/61** (adds 7 — Scenario E: downtime WO shows purple on timeline +
  calendar; start takes the asset down, complete restores it, 3h30m actual
  downtime recorded, transition visible in asset history. Scenario F:
  requester blocked from 11 paths, technician from 8, manager from 5
  admin-only paths; anonymous attachment fetch → 401; portal page source
  contains no WO numbers, user names, or request ids.)
- **Browser:** Chromium desktop + Pixel 7
- **Test user roles:** admin, manager, technician, requester, anonymous
- **Failures found & fixes:** e2e only — option-element locator ambiguity;
  a stale asset status from an earlier spec surfaced the (correct)
  don't-override-manual-state behavior and the test now resets it.
- **Final result:** PASS — Scenarios A–F all green.
