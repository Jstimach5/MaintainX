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
