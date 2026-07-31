# Seal Tech CMMS — UI redesign: final report

Measured outcome of the redesign, baseline → pilot → final. Every number
here comes from a harness run, not an estimate:

- **Rendered captures** — `scripts/ui-baseline.ts`, 215 measured captures ×
  4 roles × 6 viewports (1440×900, 1280×800, 1024×768, 768×1024, 390×844,
  360×800). Before: `docs/ui-baseline/`. After: `docs/ui-final/`.
- **Task benchmark** — `scripts/ui-tasks.ts`, 10 role scenarios driven
  through the real UI, counting clicks, field touches, navigations and
  backtracks. Before: `docs/ui-baseline/tasks.json`. After:
  `docs/ui-final/tasks.json`.
- **Automated gates** — 186 unit, 124 e2e (including 8 axe scans and 9
  visual snapshots), typecheck, lint, production build.

Both harness runs use the same `npm run db:seed` dataset, so before and
after are like-for-like.

> A note on the baseline numbers. `docs/ui-baseline/metrics.json` was
> overwritten by a later partial harness run and now holds only two rows.
> The 289 baseline PNGs are intact and unmodified, so every "before" fold
> ratio in this report is recomputed from the captured page heights
> (`full-page height ÷ viewport height ÷ device scale`) rather than read
> from the lost file. Spot-checked against the two surviving rows and
> against the figures quoted in `docs/UI_BASELINE.md`: they agree.

---

## 1. Did it meet the five goals?

| Goal | Verdict | Evidence |
|---|---|---|
| Use desktop screen space efficiently | **Met** | Content width 80% → **96%** of a 1440px screen (1152px → 1382px). Detail pages fit in far less scrolling: meter detail 1.89 → **1.17** folds, asset detail 1.18 → **1.00**. |
| Give mobile more colour, identity and visual character | **Met** | Brand header and logo on every screen, status rails on work cards, asset thumbnails and type icons in lists, one SVG icon system replacing ~40 emoji. Brand green is action-only; status keeps its own palette. |
| Improve speed and clarity of common tasks | **Mixed — see §3** | 10/10 tasks complete. Technician and requester tasks unchanged. Desktop admin/manager tasks cost **+1 click per header navigation**, the price of grouping. |
| Keep accessibility, touch targets and business behaviour | **Met** | 8 axe scans, zero serious/critical. 124/124 e2e green, including every pre-existing permission and workflow spec. Zero horizontal overflow in 215/215 captures. |
| Prove changes before applying them everywhere | **Met** | Pilot on 6 screens, reviewed in `docs/UI_PILOT_REVIEW.md`, before the remaining 41. |

---

## 2. Desktop density

Content width, `main`'s inner container as a share of the viewport:

| Viewport | Before | After |
|---|---|---|
| 1440×900 | 80% (1152px cap) | **96%** |
| 1280×800 | 90% | **95%** |
| 390×844 | ~92% | 92% (unchanged) |

Width now comes from the page's *family*, not from one global rule:
`DashboardGrid` 1600px, `ListLayout` 1500px, `DetailLayout` main + sticky
rail, `FormLayout` 672px. A 1500px-wide input row is harder to fill in than
a 640px one, which is why forms deliberately did **not** get wider.

Fold ratio (page height ÷ viewport height; 1.00 = fits one screen), admin:

| Screen | 1440×900 | 1280×800 | 1024×768 | 390×844 |
|---|---|---|---|---|
| Dashboard | 1.00 → 1.00 | 1.00 → 1.00 | 1.00 → 1.00 | 1.00 → **1.48** ⚠ |
| Work-order list | 1.00 → 1.00 | 1.00 → 1.00 | 1.00 → 1.00 | 1.55 → **1.34** |
| Asset list | 1.00 → 1.00 | 1.00 → 1.00 | 1.00 → 1.00 | 1.18 → **1.07** |
| Schedule | 1.00 → 1.00 | 1.00 → 1.00 | 1.00 → 1.00 | 1.46 → **1.28** |
| Reports | 1.24 → 1.25 | 1.39 → 1.41 | 1.48 → 1.49 | 2.68 → **2.51** |
| Work-order detail | 1.90 → 1.90 | 2.14 → 2.13 | 2.34 → 2.36 | 3.43 → 3.44 |
| Asset detail | 1.18 → **1.00** | 1.33 → **1.00** | 1.38 → **1.00** | 2.07 → **1.81** |
| Meter detail | 1.89 → **1.17** | 2.12 → **1.32** | 2.21 → **1.38** | 2.76 → 2.76 |
| Admin users | 1.00 → 1.00 | 1.00 → 1.00 | 1.00 → 1.00 | 1.20 → **1.45** ⚠ |

Across all 215 comparable captures: **34 got shorter, 16 got taller, 165
unchanged.** Read the desktop 1.00s carefully — on the small seed dataset
most list pages fit one screen before *and* after. The density gain there
is that each screen now holds more rows in the same space, which the fold
ratio cannot express; the mobile and detail-page numbers are where it
shows up as a measurement.

### The screens that got taller, and why

| Screen | Change | Reason |
|---|---|---|
| Admin/manager dashboard @390 | 1.00 → 1.48 | Six KPI tiles instead of five, plus Overdue / Upcoming / Assigned / New-requests summary cards that did not exist before. Also §4's truncation fix, which costs a line per row and is worth it. |
| Request detail @390 | 1.00–1.32 → 1.28–1.66 | `DetailLayout`'s rail stacks below the main column on phones. |
| Account @390 | 1.00 → 1.28 | Grouped into labelled sections. |
| Admin users @390 | 1.20 → 1.45 | Per-user rows gained the deactivate confirmation control. |
| Work-order detail @360 | 3.39 → 3.48 (+2.7%) | Larger touch targets and the status rail. |

None of these is a layout defect; each trades vertical space for
information or reach. The dashboard is the one worth revisiting — see §6.

---

## 3. Task benchmark

Clicks / navigations / backtracks. All 10 tasks completed in all three runs.

| Role | Task | Baseline | Pilot | Final |
|---|---|---|---|---|
| admin | Create site → location → asset | 8 / 8 / 1 | 8 / 8 / 1 | **10** / 8 / 1 |
| admin | Invite a user | 3 / 2 / 0 | 3 / 2 / 0 | **4** / 2 / 0 |
| admin | Locate asset, open QR label | 4 / 5 / 1 | 4 / 5 / 1 | **5** / 5 / 1 |
| manager | Find overdue work | 1 / 1 / 0 | 1 / 1 / 0 | 1 / 1 / 0 |
| manager | Create, assign, schedule a WO | 4 / 3 / 0 | 4 / 3 / 0 | **5** / 3 / 0 |
| manager | Review upcoming PM | 2 / 2 / 0 | 2 / 2 / 0 | **3** / 2 / 0 |
| technician | Find today's work, open, start | 2 / 2 / 1 | 2 / 2 / 1 | 2 / 2 / 1 |
| technician | Note + reading + photo + complete | 5 / 5 / 4 | 5 / 5 / 4 | 5 / 5 / 4 |
| requester | Submit a request | 2 / 1 / 0 | 2 / 1 / 0 | 2 / 1 / 0 |
| requester | Find request later, check status | 2 / 2 / 0 | 2 / 2 / 0 | 2 / 2 / 0 |

**Navigations and backtracks are identical everywhere.** The only change is
clicks, and it is entirely the grouped navigation: **+1 click per header
navigation**, on desktop, for admins and managers. The
site→location→asset task navigates the header twice, so it costs +2.

This is the trade the grouping was asked for, and it is worth stating
plainly rather than burying:

- **Cost.** One extra click to open a group before choosing a destination,
  for the two desktop roles.
- **Bought.** At 1440×900 the old header overflowed — "Reports" was clipped
  mid-word to "Rep" and Imports / Users / Teams / Audit / Settings were off
  screen entirely, in a scrollable row with no affordance that anything
  more existed (baseline finding S1). Five groups fit at every width down
  to 768px. Destinations that were previously *unreachable without
  discovering a hidden scroll* now cost one click.
- **Not paid by the field.** Technician and requester tasks are unchanged:
  their paths go through the bottom bar and through links that degrade out
  of groups for their role. The roles with the highest task frequency pay
  nothing.

The harness counts the group-opening click deliberately
(`scripts/ui-tasks.ts`, `navTo`) — a benchmark that hid it would make the
grouping look free.

---

## 4. Defects the final measurement caught

Three real problems that the source, the tests, and the pilot review all
missed, and that only the rendered captures showed. All three are fixed in
this branch.

1. **Work-order list unusable at 1024–1279px.** The table switched on at
   `md` (768px). Six columns including a long title and a full
   "overdue · Jul 29, 2026, 3:48 PM" due cell do not fit: every title
   wrapped to five lines and the Due column was pushed outside the scroll
   box. Page-level overflow stayed at zero, so the e2e viewport guard
   passed it. Fixed by switching that one list to cards below `xl`; the
   five-column lists (assets, requests, meters, PM) fit at `md` and stayed.
2. **Dashboard work-order rows truncated to one character.** At 390px the
   priority badge and the due date took the whole row, leaving the title
   rendered as `W…`. Fixed by stacking the row below `sm`.
3. **404 eyebrow below contrast floor.** `text-brand-700` on white is
   4.1:1; 14px semibold is normal text to WCAG, which needs 4.5:1. Now
   `brand-900`. It survived the Phase 9 sweep because no axe scan visited
   the 404 — now four more scans do (404, /forbidden, an open nav panel,
   an open confirmation dialog).

---

## 5. Accessibility and regression gates

| Gate | Result |
|---|---|
| axe (wcag2a/2aa/21a/21aa), serious + critical | **0** across 8 scans: login, 11 admin pages, WO detail, asset detail, 3 technician phone screens, 404, /forbidden, open nav panel, open confirmation dialog |
| Horizontal overflow | **0 / 215** captures |
| e2e | **124 / 124** (was 99 before this phase; +13 navigation, +9 visual, +3 a11y) |
| Unit | **186 / 186** |
| typecheck / lint / build | clean |

Colour is never the only signal: status badges carry text, work cards pair
their coloured rail with the badge, the current nav item carries
`aria-current="page"` as well as a colour, and inline prose links are
permanently underlined.

Visual snapshots (`e2e/97-visual.spec.ts`) gate the shell per role, an open
disclosure panel, the field bottom bar, sign-in, the forms, and the
404/forbidden states. Record-bearing pages are deliberately excluded: the
suite creates rows as it runs, so their snapshots would diff on data rather
than design. Those pages are covered by the capture harness, which is
reviewed rather than asserted.

---

## 6. What is left

| # | Item | Why it was not done |
|---|---|---|
| 1 | **Official logo files.** `src/components/brand.tsx` is a mark recreated from a screenshot of sealtechinsulation.com, and `src/app/icon.svg` matches it. | Both domains return 403 through this environment's proxy, so the real assets could not be fetched. The file is the single swap point — drop the official files in and every call site (header, sign-in, QR label) picks them up unchanged. |
| 2 | **Route-level `loading.tsx`.** | Deferred: on Next 16.2.12 it intermittently hangs server-action response streams (2/3 reproductions with, 0/3 without). A hung write is worse than a missing skeleton. Recorded in `docs/DECISIONS.md` §9 with the reproducer; re-test on the next minor. |
| 3 | **Admin dashboard mobile density** (1.00 → 1.48 folds). | The extra height is real information, but the six-tile grid could collapse to a summary strip on phones. Worth measuring against the task benchmark before changing — this project's rule is to measure first, and there was no measurement budget left after the rollout. |
| 4 | **Work-order detail on phones** (3.44 folds). | The rail's Timer / Labour / Parts / Meter / History forms stack below the main column, and they are long. Collapsing the rarely-used ones behind disclosures would cut this sharply — the same fix that worked for filter toolbars in Phase 8 — but it changes the field workflow and belongs behind a fresh task-benchmark run, not a last-minute edit. |

## 7. Reproducing these numbers

```bash
npm run db:seed
npm run build && cp -r .next/static .next/standalone/.next/static
(cd .next/standalone && PORT=3000 node server.js)     # `next start` is unsupported: output is standalone

OUT_DIR=docs/ui-final  npx tsx scripts/ui-baseline.ts  # mutation-free, re-runnable
OUT_FILE=docs/ui-final/tasks.json npx tsx scripts/ui-tasks.ts && npm run db:seed   # mutates

npm run typecheck && npm run lint && npm test && npx playwright test && npm run build
```
