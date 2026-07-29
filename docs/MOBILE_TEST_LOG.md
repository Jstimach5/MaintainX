# Mobile Test Log

Every mobile verification cycle is recorded here: what was tested, the
exact commands, the viewport(s), the roles used, what failed, what was
fixed, and the final result. A feature is never marked Verified in
MOBILE_FEATURE_MATRIX.md without an entry here.

---

## M0 — Audit baseline

### 2026-07-28 — Baseline verification before mobile work

- **Purpose:** establish the honest starting point for the mobile field
  work, and land the in-flight Phase 14 changes.
- **Commands run:** `npm run typecheck`, `npm run lint`, `npm test`,
  `npx playwright test`.
- **Results:** typecheck clean; lint clean; vitest **143/143** (adds 4 for
  the Phase 14 parts service).
- **Playwright:** first run after the Phase 14 changes surfaced 3 real
  failures, all in test expectations rather than product code:
  1. `80-reports.spec.ts` asserted a technician gets 403 on `/schedule` —
     Phase 14 deliberately opens that page to technicians (scoped to their
     own work). Expectation updated to assert the scoped "My schedule"
     heading instead.
  2. `85-field-docs.spec.ts` located the technician by the fixture display
     name "E2E tech"; the 00-auth spec renames that user to "Terry Tech"
     through the UI. Locator updated to the visible name (matching the
     96- spec's approach).
  3. `85-field-docs.spec.ts` created its work order with a planned start
     but no due date, while `CalendarView` plots by due date — the
     calendar assertion could never pass. Test now sets a due date.
- **Corrected run:** `npx playwright test` → **64/64 passed** (4.2m),
  including the three new Phase 14 tests.
- **Viewport projects added:** `iphone` (iPhone 14, 390×664),
  `android-small` (Galaxy S8, 360×740), `tablet` (iPad Mini, 768×1024),
  alongside the existing desktop and Pixel 7 projects. New tag convention:
  `@mobile` = phone-viewport flow tests (Pixel 7 only, stateful);
  `@field` = **read-only** layout checks that run at every width — they
  must stay mutation-free because the same assertions execute four times
  against shared data. A first attempt tagged the existing stateful mobile
  flows `@field`; that was reverted before running, since re-running them
  per viewport would have broken absolute assertions (e.g. a parts total).
- **New spec:** `e2e/98-viewports.spec.ts` — technician field screens have
  no horizontal page scroll; a work order is readable with fingertip-sized
  controls; the request form fits and its fields are usable.
- **Roles:** admin, manager, technician, requester.
- **Final result:** PASS for the baseline. The new viewport projects and
  98-viewports spec are verified in the M1 entry (they were added after
  this run started).

---

## M1 — Field shell

### 2026-07-28 — Verification cycle

- **Feature tested:** five-slot bottom navigation on small screens (with
  the desktop header link row hidden there); technician field home screen
  (assigned / due today / overdue / in progress / on hold / maintenance
  due tiles, big New Request and Scan buttons, today's work, available
  work, own requests); `/scan` asset lookup; `/account`; sticky
  work-order action bar with jump links to pictures, notes, and readings.
- **Commands run:** `npm run typecheck`, `npm run lint`, `npm run build`,
  `npx vitest run tests/field.test.ts`.
- **Automated results:** typecheck clean, lint clean, production build
  clean (`/scan` and `/account` registered as dynamic routes), **5/5**
  new unit tests for the field summary service.
- **Bug found by the tests (product, not test):** the "Due today" bucket
  compared `formatDate(...)` output ("Jul 28, 2026") against
  `todayInTimezone(...)` ("2026-07-28"), so it could never match and the
  tile would always have read 0. Both sides now use the ISO helper
  (`todayInTimezone(tz, instant)`), per DECISIONS.md #5.
- **Viewports:** desktop + Pixel 7 (e2e), iPhone 14 / Galaxy S8 / iPad
  Mini via the read-only `@field` layout spec.
- **Roles:** technician, requester, manager.
- **Final result:** unit + static checks PASS; browser evidence recorded
  in the M2 entry (both phases were exercised in one suite run).

---

## M2 — Lifecycle statuses, reasons, approval, labor timer

### 2026-07-28 — Verification cycle

- **Feature tested:** `paused` and `waiting_approval` statuses;
  "Waiting for parts" relabel; a required reason for pause / hold /
  waiting; optional completion approval (org setting, default off) with
  manager approve and send-back; labor timer with start, pause-and-bank,
  resume, stop-and-log, and one-active-timer-per-person enforcement.
- **Commands run:** `npm run db:generate`, `npm run db:migrate` (all
  three databases recreated from empty), `npm run db:seed`,
  `npm run typecheck`, `npm run lint`, `npm test`.
- **Automated results:** **155/155** unit tests (adds 7 for M2 plus the 5
  from M1). All 13 migrations applied cleanly to three freshly created
  databases — a clean-database re-verification.
- **Migration note:** `ALTER TYPE … ADD VALUE` is not reversible, so
  regenerating migration 0012 required recreating cmms_dev / cmms_test /
  cmms_e2e rather than rolling back. Verified the full chain replays from
  empty.
- **Failures found & fixes (all real, caught before commit):**
  1. `changeWorkOrderStatus` read the org setting through the
     `cache()`-wrapped `getOrgSettings`, which is scoped to a render pass
     — outside one (worker jobs, tests) a memoized value can outlive a
     change. Added `readOrgSettings()` and used it in service code.
  2. The reports module kept its own hardcoded list of open statuses, so
     `paused` and `waiting_approval` work would have silently vanished
     from backlog and overdue KPIs. List updated, with a comment tying it
     to the enum.
  3. The import status normalizer mapped "paused" onto `on_hold`; it now
     maps faithfully, and understands "waiting for parts" and
     "pending approval".
  4. The desktop quick bar's "Put on hold" button would now fail the
     reason requirement; replaced by the reason-carrying interrupt form,
     and "Start work" reads "Resume work" out of a paused state.
- **Viewports:** desktop + Pixel 7.
- **Roles:** admin, manager, technician.
- **Final result:** recorded with the browser-suite outcome below.

---

## M1/M2 close-out — settings screen, browser evidence, and a real bug

### 2026-07-29 — Verification cycle

- **Feature tested:** the full application after M1+M2 plus the new
  /admin/settings screen (org name, timezone, completion-approval toggle,
  audited updates via updateOrgSettings/readOrgSettings).
- **Automated results:** unit **159/159** (adds 4 org-settings tests);
  production build clean; Playwright **88/88** across five projects —
  desktop, Pixel 7, iPhone 14, Galaxy S8, iPad Mini (the Apple projects
  run chromium pinned as viewport emulations; WebKit is not installed).
- **Real product bug found by the e2e suite** (the reason this cycle took
  several runs): every same-page form action redirected back to its own
  route. A second submission racing that redirect's RSC refresh was
  dropped silently — no POST ever left the browser — and the refresh could
  close panels mid-interaction. On a phone this reads as "the button does
  nothing" (e.g. pausing the timer right after logging an interrupt
  reason). Diagnosed from the Playwright trace (zero network activity for
  the completion submit) and a live browser harness. Fix: same-page
  actions now return success and rely on revalidatePath's refresh;
  client components with panel/input state get server-computed keys
  (status+updatedAt, list lengths, meter values) so success remounts them
  fresh while a failed validation preserves the user's input. Applied to
  work-order, procedure-step, and meter actions alike.
- **Test-harness fixes along the way:** Apple viewport projects had never
  launched (WebKit default → pinned chromium); hidden desktop bars
  measured as 0-height fingertip targets (visible-only filter); stale
  dashboard/schedule expectations from the M1 field home; unbounded click
  timeout swallowing the completion helper's retry.
- **Viewports:** all five projects. **Roles:** admin, manager, technician,
  requester.
- **Final result:** PASS — 88/88; M1, M2, and the settings screen are all
  browser-verified.
