# UI Pilot Review — Seal Tech CMMS redesign

Date: 2026-07-31 · Branch `claude/sealtech-cmms-ui-redesign-ib55z9`
Status: **awaiting review — no further rollout until this pilot is approved** (docs/UI_REDESIGN_PLAN.md D-6 gate).

## What the pilot covers

The six agreed screens, rebuilt on the new foundations (semantic tokens, lucide icons, temporary brand mark, layout templates):

1. **Dashboard** — manager/admin analytical dashboard on `DashboardGrid` (12-col, 1600px cap): linked KPI tiles with icons, a real **Needs attention** panel (expands the old one-line warning into per-category counts + links), split **Overdue / Upcoming** lists, **New requests** and **Asset issues** panels, and header quick actions (New work order / New request). Requester home also gained status badges and guidance text.
2. **Technician mobile home** (FieldHome) — brand eyebrow + greeting, green `BigAction` buttons with icons, KPI tiles with icons, notification chip, work cards with **status rails** (always paired with the text badge), merged the dead "Today" card into a single "My work" list when today is empty.
3. **Work-order list** — `ListLayout` (1500px cap): desktop becomes a real six-column table (Work order / Status / Priority / Site / Assigned / Due, overdue emphasized in place); phones get record cards with status rails; toolbar on shared `Input`/`Select` primitives.
4. **Work-order detail** — `DetailLayout`: back link, site breadcrumb link, label/value rows read left-to-right (no more far-flung values), status history as a timeline, sticky rail at lg+; every form, label, and action name preserved.
5. **Asset detail** — `DetailLayout`: back link + breadcrumb, **New work order promoted to the header** (primary), rarely-used Transfer form collapsed behind the app's first `<details>` disclosure, status/location history as timelines.
6. **Technician mobile WO flow** — sticky action bar icons switched from emoji to lucide, completion sheet gained a title, active tab state (underline + `aria-current`) on the bottom nav, dark forest branded header everywhere.

Plus shell branding shared by all of the above: brand-950 header with the SEAL ◆ TECH temporary mark, white/80 nav links, lucide bell, favicon; `Button`/`ButtonLink`/focus rings recolored to the AA-safe brand green (`#2E7D32`/`#1B5E20`); an app-level `error.tsx` boundary.

## Before / after evidence

Same harness, same seed, same viewports. Pairs (before → after):

| Screen | Before | After |
|---|---|---|
| Dashboard 1440 | `docs/ui-baseline/admin/dashboard--1440x900.png` | `docs/ui-after/admin/dashboard--1440x900.png` |
| Tech home 390 | `docs/ui-baseline/technician/dashboard--390x844.png` | `docs/ui-after/technician/dashboard--390x844.png` |
| WO list 1440 | `docs/ui-baseline/admin/work-orders--1440x900.png` | `docs/ui-after/admin/work-orders--1440x900.png` |
| WO detail 1440 | `docs/ui-baseline/admin/work-order-detail--1440x900.png` | `docs/ui-after/admin/work-order-detail--1440x900.png` |
| WO detail 390 | `docs/ui-baseline/technician/work-order-detail--390x844.png` | `docs/ui-after/technician/work-order-detail--390x844.png` |
| Completion sheet 390 | `docs/ui-baseline/technician/work-order-complete-form--390x844.png` | `docs/ui-after/technician/work-order-complete-form--390x844.png` |
| Asset detail 1440 | `docs/ui-baseline/admin/asset-detail--1440x900.png` | `docs/ui-after/admin/asset-detail--1440x900.png` |
| Asset list 1440 | `docs/ui-baseline/admin/assets--1440x900.png` | `docs/ui-after/admin/assets--1440x900.png` |

All 88 after-captures + `metrics.json` live in `docs/ui-after/`.

**Mechanical deltas** (metrics.json before → after):
- Pilot pages' `main` width at 1440×900: **80% → 100%** of the viewport (inside the per-template caps with consistent gutters). Non-pilot pages unchanged at 80% via the `(classic)` group.
- Horizontal overflow: **0 pages before, 0 pages after** (the contractual invariant held).
- Dashboard fold usage at 1440: content that filled ~45% of one screen now fills the screen with six panels; no dead gray field.

## Task benchmark — baseline vs pilot

Identical scripted paths, fresh seed both times (`docs/ui-baseline/tasks.json` vs `docs/ui-after/tasks.json`):

| Role · task | Clicks | Fields | Navs | Backtracks | Done |
|---|---|---|---|---|---|
| admin · create site→location→asset | 8→8 | 4→4 | 8→8 | 1→1 | ✓ |
| admin · invite a user | 3→3 | 2→2 | 2→2 | 0→0 | ✓ |
| admin · locate asset, QR label | 4→4 | 1→1 | 5→5 | 1→1 | ✓ |
| manager · find overdue work | 1→1 | 0→0 | 1→1 | 0→0 | ✓ |
| manager · create/assign/schedule WO | 4→4 | 4→4 | 3→3 | 0→0 | ✓ |
| manager · review upcoming PM | 2→2 | 0→0 | 2→2 | 0→0 | ✓ |
| technician · find today's work, start | 2→2 | 0→0 | 2→2 | 1→1 | ✓ |
| technician · note+reading+photo+complete | 5→5 | 4→4 | 5→5 | 4→4 | ✓ |
| requester · submit request | 2→2 | 2→2 | 1→1 | 0→0 | ✓ |
| requester · find request, check status | 2→2 | 0→0 | 2→2 | 0→0 | ✓ |

**Interpretation:** 10/10 complete, zero interaction-cost regressions on the minimum paths. The wins the counters can't see (they script the optimal path): the dashboard now *shows* overdue/attention items instead of requiring a hunt, "New work order" is reachable from the dashboard and asset header, the overdue state is visible in every list without filter tricks, and the nav-overflow trap (S1) is mitigated on pilot screens by dashboard quick actions (full fix = Phase 5 grouped nav). Baseline confusion points addressed: dead "Today" card (gone), completion sheet title (added), status-only-color (rails always paired with badges).

## Requirement checklist (user's Phase 4 list)

| Requirement | Status |
|---|---|
| Better desktop information density | ✅ table lists, 12-col dashboard, 100% width usage |
| Clear visual hierarchy | ✅ uppercase section headers, label/value grids, header/actions split |
| Branded but restrained color | ✅ brand green only on actions/links/accents; statuses stay semantic |
| Official logo | ⚠️ temporary recreated mark (approved interim); swap point ready in `brand.tsx` |
| Consistent SVG icons | ✅ lucide on all pilot screens (emoji remain only on unconverted classic pages) |
| Clear status treatment | ✅ rails + badges paired, overdue named in text |
| Improved actions | ✅ quick actions, promoted primary per page, Transfer demoted |
| Active navigation | ✅ mobile tabs (`aria-current` + underline); desktop grouped nav is Phase 5 |
| Loading, empty, error, success states | ◐ error boundary + empty states shipped; **route loading skeletons deferred — see finding F1**; success confirmations are Phase 9 (StatusMessage) |
| Keyboard navigation | ✅ visible focus rings on header/nav/tiles/buttons (brand-600) |
| Mobile usability | ✅ 44px targets kept, no horizontal overflow at 360px, sticky bars intact |

## Findings during the pilot

**F1 — Next.js 16.2.12: route `loading.tsx` intermittently hangs server-action responses (deferred).**
With route-level `loading.tsx` files present, submitting any `useActionState` form after other sessions had aborted RSC prefetches would intermittently leave the action response stream stuck (button pinned on "Saving…", DB idle, action committed server-side). Reproduced 2/3 rounds with loading files, 0/3 without them, 0/3 with only `error.tsx`, 0/3 on the pre-pilot build — bisected to the loading boundaries specifically. Decision: ship the pilot **without route loading files**; revisit in Phase 9 with targeted `<Suspense>` around slow panels and/or after a Next patch upgrade. (`error.tsx` is unaffected and shipped.)

**F2 — Danger adjacency on WO detail.** "Cancel" (danger) still sits beside "Mark completed…" in the QuickStatusBar. Restyling it without a confirmation step felt wrong; the destructive-confirmation Dialog is a Phase 6 component, so the fix lands there.

**F3 — Desktop nav still overflows for admins at 1440.** Expected — the grouped disclosure nav is Phase 5, gated behind this review. The branded header makes the overflow slightly more visible (white text on dark), which strengthens the case for proceeding to Phase 5 promptly.

## Verification

- `npm run typecheck` / `npm run lint` clean; **186/186** unit tests; `npm run build` clean.
- Full Playwright e2e suite: **95/95 passed** (desktop, Pixel 7, iPhone 14, Galaxy S8, iPad Mini). One spec updated: `e2e/98-viewports.spec.ts` picks the `:visible` list-link variant, matching the spec's own convention for the responsive table/cards pattern.
- Task harness 10/10 across all four roles.
- No horizontal overflow in any of the 88 after-captures.

## Asking for review

1. Does the direction (density, brand treatment, table lists, rails) match what you want before it rolls to the remaining ~40 pages?
2. The temporary mark: good enough to keep until you can supply the official SVG/PNG, or should the wordmark styling change?
3. Any pilot screen you want adjusted before Phase 5 (grouped nav) and the family-by-family rollout begin?
