# Rendered UI Baseline — Seal Tech CMMS

Captured: 2026-07-31 · production build (`npm run build && npm start`) against `npm run db:seed` data · 217 screenshots in `docs/ui-baseline/` + `docs/ui-baseline/metrics.json`.

Method: `scripts/ui-baseline.ts` logs in as each seeded role and captures every screen in the inventory at 1440×900, 1280×800, 1024×768, 768×1024, 390×844, 360×800 (mobile sizes with touch emulation), recording per page: horizontal overflow, `main` width as % of viewport, and scroll-height-to-viewport ratio ("fold"). Screens marked ★ were individually reviewed for this document; the rest are instances of a ★-reviewed layout idiom and their captures/metrics are on disk for spot-checking. The harness is mutation-free (reveal-only clicks), so re-running it after the pilot produces like-for-like "after" captures (`OUT_DIR=docs/ui-after`).

## Mechanical summary (from metrics.json)

- **Horizontal overflow: none anywhere** (217/217 pass) — the e2e guarantee holds; the redesign must keep it.
- **Desktop width usage:** every app page's `main` is capped at 1152px (`max-w-6xl`) = **80% of a 1440px screen used, less after card padding**; login uses **27%**. At 1280 the cap is 90%.
- **Vertical usage at 1440×900** (fold ≈ 1.0 means content doesn't fill even one screen): dashboard 1.0, WO list 1.0, assets 1.0, sites 1.0, pm-plans 1.0, admin-users 1.0, schedule 1.0 — **most desktop pages are majority empty gray**. Content-heavy pages: WO detail 2.44, meter detail 1.89, reports 1.24.
- **Mobile fold pressure** (content below fold on 390×844): WO detail 3.2, reports 2.7, meter detail 2.8 — long single-column scrolls with no in-page navigation except the WO sticky bar's jump links.

## Systemic findings (apply to nearly every screen)

| ID | Finding | Rendered evidence |
|---|---|---|
| S1 | **Admin/manager nav overflows even at 1440×900** — "Reports" is clipped mid-word ("Rep"), Imports/Users/Teams/Audit/Settings are off-screen in a scrollable row with no affordance that more exists. This is the strongest single argument for the grouped dropdowns. | `admin/dashboard--1440x900.png` (top bar) |
| S2 | **No "you are here"** — nav links and mobile tabs render identically on every page. | any two captures of different pages |
| S3 | **Zero brand identity** — generic blue everywhere, hardcoded "Maintenance Manager" wordmark, default favicon, emoji icon system (🏠🔧📝📷👤🔔) that renders in mismatched cartoon styles next to flat UI. | every capture |
| S4 | **Desktop is a phone layout stretched** — one centered column; stacked 2-line list rows with a wide gap between text and right-aligned badges; label/value detail rows push values to the far right edge of wide cards (eye travel). | `admin/work-orders--1440x900.png`, `admin/asset-detail--1440x900.png` |
| S5 | **Dead vertical space** — see fold ≈ 1.0 list above; at 1440 the dashboard shows 5 tiles + 2 short cards and ~55% empty gray. | `admin/dashboard--1440x900.png` |
| S6 | **No loading/error/404 affordances** — route transitions render nothing until done; `/no-such-page` falls through to the unstyled framework 404 (`admin/not-found--1280x800.png`); errors would do the same. `/forbidden` exists but is bare text. |
| S7 | **Status chips all look alike** — priority (`medium`) and status (`Assigned`) are identical pastel pills side-by-side with no grouping or iconography; overdue is the only emphatic treatment (red text in a gray meta line). | `admin/work-orders--1440x900.png` |
| S8 | **Filter toolbars wrap awkwardly** — on the WO list at 1440 the Filter button lands alone on a second row; date inputs are unstyled browser defaults (`mm/dd/yyyy`). | `admin/work-orders--1440x900.png`, `admin/reports--1440x900.png` |

## Screen-by-screen

Format — **User/purpose · Primary action · Secondary · Visible info · Unused space · Below fold · Width cap · Inconsistencies · Nav problems · Missing states · A11y · Screenshots**.

### ★ Login (`anon/login--*`)
- **User/purpose:** everyone; authenticate.
- **Primary:** Sign in. **Secondary:** Forgot password.
- **Visible:** username/password, subtitle "Maintenance Manager".
- **Unused space:** ~73% of the width; bare form floats on gray with no card, unlike every sibling auth page.
- **Below fold:** none. **Width cap:** `max-w-sm` (384px = 27% @1440).
- **Inconsistencies:** only auth page without a card; different width from forgot/reset/invite (`max-w-md`).
- **Nav problems:** n/a. **Missing states:** no pending state on submit.
- **A11y:** fine structurally; no brand landmark.
- **Shots:** `anon/login--1440x900.png` … all 6.

### ★ Admin/manager dashboard (`admin/dashboard--*`, `manager/…`)
- **User/purpose:** managers/admins; morning triage — what needs attention.
- **Primary:** none visible (no action buttons at all). **Secondary:** tile/links into lists.
- **Visible:** 5 stat tiles (Open, Overdue, Assigned to me, Assets down, New requests), "Assigned to me" card (often empty), "Due soon" card.
- **Unused space:** ~55% of viewport empty at 1440; tiles don't fill the row; right column of "Due soon" dates wraps raggedly.
- **Below fold:** nothing (fold 1.0) — the page *under*-uses even one screen.
- **Width cap:** 1152px. **Inconsistencies:** "0" tiles carry the same visual weight as actionable ones; empty "Assigned to me" card renders as dead space.
- **Nav problems:** S1 (nav overflow) most visible here; no quick actions (New WO / New request) despite being the landing page.
- **Missing:** PM status, asset issues, per-site breakdown, any trend; no loading state.
- **A11y:** tile numbers color-only for meaning (red overdue) — needs paired label (has label, ok) — main risk is link affordance (whole tile not clickable).
- **Shots:** `admin/dashboard--1440x900.png`, `manager/dashboard--*`.

### ★ Technician field home (`technician/dashboard--390x844.png` ★, desktop variants captured)
- **User/purpose:** technician on a phone; "what's my work today".
- **Primary:** New request + Scan asset (two big buttons). **Secondary:** 6 count tiles, notifications banner, Today, All my work.
- **Visible:** greeting, actions, counts, work list with priority/status chips.
- **Unused space:** modest on phone; on desktop the same single column floats in the 1152px cap.
- **Below fold:** "All my work" list (fold ~1.9 @390).
- **Inconsistencies:** emoji inside primary buttons ("📝 New request" wraps to two lines while its twin stays on one); zero-count tiles get equal prominence; "Today — Nothing scheduled" renders as a dead card.
- **Nav problems:** bottom tabs have no active state; no link to Schedule.
- **Missing:** overdue emphasis in "All my work" (chips only), skeletons.
- **A11y:** emoji announced inconsistently; count tiles are links but look static.
- **Shots:** `technician/dashboard--390x844.png`, `--360x800.png`, desktop set.

### ★ Requester home (`requester/dashboard--390x844.png` ★)
- **User/purpose:** requester; submit + track requests.
- **Primary:** New request. **Secondary:** recent-request links.
- **Visible:** greeting, one button, "Your recent requests" with status as trailing gray text ("· submitted") — not even a badge.
- **Unused space:** ~85% of the phone screen empty; worse on desktop.
- **Missing:** status badge/timeline, empty-state guidance, "what happens next" education.
- **Shots:** `requester/dashboard--*`.

### ★ Work-order list (`admin/work-orders--1440x900.png` ★, technician/manager sets, `--mine` mobile set)
- **User/purpose:** staff; find and triage work.
- **Primary:** New work order. **Secondary:** filter form, row links.
- **Visible:** 6 rows × (number+title link, meta line, priority+status chips).
- **Unused space:** ~45% of row width between text and right-aligned chips; ~700px empty below the list at 1440; fold 1.0.
- **Width cap:** 1152px. **Inconsistencies:** S7 chip soup; S8 toolbar wrap (Filter button orphaned on row 2).
- **Nav problems:** no column sort, no pagination affordance (list is capped server-side), assignee/due buried mid-meta-line.
- **Missing:** loading skeleton; bulk actions; the schedule page has the *table* version of this same data — two different presentations of one dataset (see Schedule).
- **A11y:** links rely on color alone vs surrounding text (blue-800 on white passes, but no underline until hover).
- **Empty variant:** `admin/work-orders-empty--*` — EmptyState card renders correctly (dashed border, hint) — pattern worth keeping.
- **Shots:** as listed.

### ★ Work-order detail (`admin/work-order-detail--1440x900.png` ★, `technician/…--390x844.png` ★)
- **User/purpose:** the app's core screen — do/track one job.
- **Primary:** Mark completed… (desktop) / sticky Complete (mobile). **Secondary:** Cancel, Edit, timer, labor log, parts, meter readings, attachments, comments.
- **Visible @1440:** title, breadcrumb-ish site line, 3 chips, action card, Details, Assets, Procedures, Pictures; right rail: Timer, Log labor, Parts.
- **Unused space:** action card is ~80% empty; Details values right-flushed across a 720px card.
- **Below fold:** comments, status history (fold 2.44 @1440, 3.2 @390).
- **Inconsistencies:** red **Cancel** (danger) sits directly beside the primary action with no confirmation step; "Start timer" competes at equal weight with "Mark completed"; browser-default date input.
- **Nav problems:** no breadcrumb back to WO list; site/location line is plain text, not links.
- **Missing:** timeline view of status history above the fold; loading state; success confirmation after actions (page just re-renders).
- **Mobile (★):** sticky action bar (Picture/Note/Reading + Complete) is a genuinely good pattern — keep and brand it; completion reveal works as a bottom sheet (`work-order-complete-form--390x844.png` ★) but the sheet has no title and its Cancel sits beside Complete at near-equal weight.
- **A11y:** emoji jump-icons in sticky bar (📷💬📊) with 10px labels; sheet lacks a heading/landmark; chips color-only differentiation.

### ★ Asset detail (`admin/asset-detail--1440x900.png` ★, technician set)
- **User/purpose:** asset record — status, history, docs, QR.
- **Primary:** unclear — QR label / Edit / Archive all equal secondary weight in the header; rail has Update status + Transfer forms always expanded.
- **Visible:** Details (make/model/serial/year), Pictures, Work history; rail: Change status, Transfer, Status history ("No status changes yet" dead card).
- **Unused space:** Details values flushed right across the wide card; Pictures card mostly empty.
- **Missing:** meters on the asset (they exist on the WO page!), open-WO count, location history panel visibility, breadcrumbs (site › location › asset is plain text).
- **Inconsistencies:** always-open rarely-used forms (Transfer) add noise; archive has no confirm.
- **Shots:** as listed.

### ★ Schedule (`admin/schedule--1440x900.png` ★, technician/manager sets)
- **User/purpose:** managers (and techs, scoped) — plan the week, catch overdue.
- **Primary:** Filter. **Secondary:** Table/Calendar/Timeline segmented control (one-off styling), row links.
- **Visible:** real `<table>` (the only list that uses one): WO / Status / Priority / Site / Assigned / Planned start / Due.
- **Unused space:** columns squeeze ("Main Plant" wraps to two lines) *inside* the 1152 cap while 288px of viewport sits empty — the clearest single demonstration that the cap hurts tables.
- **Inconsistencies:** this table vs the WO list's stacked rows = two presentations of the same records; segmented control styled nothing like other controls.
- **Missing:** overdue rows get red date text only — no row emphasis; no today marker in table view.
- **Shots:** as listed; calendar/timeline variants not captured (same shell).

### ★ Reports (`admin/reports--1440x900.png` ★, manager set)
- **User/purpose:** manager/admin analytics + CSV/print export.
- **Structurally the best desktop page** — stat row + two-column chart cards; still capped at 1152px and all bars are the same blue (BAR_HUE) regardless of series meaning; red used for both "overdue count" and "0% PM compliance" numerals.
- **Inconsistencies:** save-view input inline with no label; date inputs browser-default; Export CSV / Print equal weight to Apply.
- **Missing:** empty-range guidance; chart accessibility (bars have no text alternative beyond adjacent numbers — numbers are present, acceptable).
- **Shots:** as listed.

### ★ Site detail (`admin/site-detail--1440x900.png` ★)
- **User/purpose:** admin; manage one site + its location tree.
- **Primary:** Add location. **Secondary:** Edit site, per-node Edit/+Sub-location, portal enable.
- **Visible:** portal card, Locations tree (indented text + inline links).
- **Unused space:** ~65% of viewport empty; tree links crowd the node labels.
- **Missing:** counts per location (assets/WOs), breadcrumb, archive state visibility; no `/locations` overview anywhere (nav gap N5).
- **Shots:** as listed.

### ★ Meter detail (`admin/meter-detail--1440x900.png` ★, technician set; meters list captured)
- **User/purpose:** record readings, watch trend, manage triggers.
- Uses a narrower centered column (~768px) — a *third* width convention.
- **Visible:** Enter a reading (good: primary task first), Triggers, Trend chart (blue line), Reading history table.
- **Inconsistencies:** reading form layout (input + button + full-width note below) reads as two rows; trigger row's Disable is a bare link while "+ Add trigger" is a button; table header style differs from schedule's.
- **Missing:** threshold markers (warn 4500 / critical 4900 exist in data!) absent from the chart.
- **Shots:** as listed.

### ★ New request form (`requester/request-new--390x844.png` ★)
- **The best mobile screen in the app** — clear labels, generous touch targets, sensible placeholder copy, logical order. Baseline to preserve.
- **Missing:** photo field is below fold with no hint it exists; no inline validation (server round-trip only); no draft protection.

### Admin users (`admin/admin-users--1440x900.png` ★)
- List idiom instance: name link + username, role badge, Deactivate text-link at far right. Deactivate (destructive) is a plain gray link with no confirm. "Open invitations — None" dead section. Fold 1.0, same cap.

### Instances of ★-reviewed idioms (captures + metrics on disk, no separate findings)
- **Assets list, Requests list (admin), PM plans list, Meters list, Notifications, Account** — same stacked-row `Card divide-y` idiom as the WO list (S4/S5/S7 apply). PM list adds "Run scheduler now" secondary in header; Account is the mobile overflow menu — flat, unsectioned (its restructure is in the approved nav plan).
- **Request detail** (`requester/request-detail--390x844.png` ★ viewed): decent structure; comments form always expanded; status chip + low chip same pastel problem.
- **Forbidden / not-found:** `technician/forbidden--*` is a bare sentence in the shell; `admin/not-found--1280x800.png` is the unstyled Next 404 — both need designed states (S6).
- **Empty variants:** `admin/work-orders-empty--*`, `admin/assets-empty--*` — EmptyState component works; keep its pattern.

## Task & usability baseline

Recorded by `scripts/ui-tasks.ts` (raw numbers in `docs/ui-baseline/tasks.json`). Scripted Playwright runs measure *interaction cost* — clicks, form-field touches, page navigations, backtracks — on the same seed. Time is scripted wall-clock (machine speed; comparable only against other runs of the same script). The scripted path is the **minimum** path: a human unfamiliar with the UI pays extra cost from S1 (overflowing nav) and S2 (no active state) that these counters can't see. Ease (1–7, higher = easier) and confusion points are reviewer judgments; the User-ease column is left blank for real-user ratings if desired. Note: on detail pages, form submissions re-render the same URL, which the harness counts as "backtracks" — for those rows the number reflects post-action re-renders, not lost users.

| Role | Task | Done | ms | Clicks | Fields | Navs | Back | Ease | User ease | Confusion points |
|---|---|---|---|---|---|---|---|---|---|---|
| admin | Create site → location → asset | ✓ | 1045 | 8 | 4 | 8 | 1 | 4 | | Three separate forms across two modules; asset form doesn't carry site/location context from the site you just made; "Add location" is a small link on the site page. |
| admin | Invite a user | ✓ | 248 | 3 | 2 | 2 | 0 | 6 | | "Invite user" vs "Add manually" choice unexplained; one-time link only appears after submit. |
| admin | Locate asset, open QR label | ✓ | 631 | 4 | 1 | 5 | 1 | 5 | | Search requires the Filter click; label page relies on the browser's print UI with no printed-identity branding. |
| manager | Find overdue work | ✓ | 138 | 1 | 0 | 1 | 0 | 4 | | Worked in 1 click only because the overdue WO happened to be in "Due soon"; there is **no overdue filter/view anywhere** — otherwise you scan lists for red date text. |
| manager | Create, assign, schedule a WO | ✓ | 454 | 4 | 4 | 3 | 0 | 5 | | Solid form; browser-default datetime control; no success confirmation (silent redirect to detail). |
| manager | Review upcoming PM | ✓ | 183 | 2 | 0 | 2 | 0 | 6 | | Nav label "PM" is jargon; plan detail shows occurrences clearly. |
| technician | Find today's work, open, start | ✓ | 335 | 2 | 0 | 2 | 1 | 5 | | "Today — nothing scheduled" dead card shows while real work sits under "All my work"; start itself is clear. |
| technician | Note + meter reading + photo + complete | ✓ | 20852* | 5 | 4 | 5 | 4* | 4 | | Comment box at the bottom of a 3.2-fold scroll; meter "Record" is a small secondary button; photo upload gives no visible confirmation (*the 20s is the harness waiting for one); completion sheet has no title. |
| requester | Submit a request | ✓ | 174 | 2 | 2 | 1 | 0 | 6 | | Best form in the app; success feedback is minimal. |
| requester | Find request later, check status | ✓ | 155 | 2 | 0 | 2 | 0 | 5 | | Status is plain gray text on the home card; no explanation of the request lifecycle stages. |

Post-pilot and post-rollout, the same script re-runs (`OUT_FILE=docs/ui-after/tasks.json`); the redesign must not increase click/nav counts on these paths, and the specific confusion points above are its checklist.

## What this baseline commits the redesign to

1. **Grouped nav is not cosmetic** — S1 shows admins literally cannot see a third of the nav at 1440.
2. **Desktop density is the headline problem** — fold 1.0 + 80% width cap + stacked-phone rows on most pages; ListLayout/DetailLayout/DashboardGrid templates target exactly this.
3. **Mobile needs identity, not decoration** — structure is mostly sound (sticky action bar, request form); it needs brand color, real icons, active states, and status treatment with meaning.
4. **Keep what works:** EmptyState pattern, WO sticky action bar, meter page task-first ordering, reports page structure, zero-horizontal-overflow guarantee, 44px targets.
