# Seal Tech CMMS — UI Redesign Plan (revised)

## Context

The CMMS at cmms.sealtechinsulation.com is live with real assets/users. The first plan leaned on code consolidation, recoloring, and navigation. This revision restructures the work around five goals set by the user:

1. Use desktop screen space efficiently.
2. Give mobile more color, identity, and useful visual character.
3. Improve speed and clarity of common CMMS tasks.
4. Maintain accessibility, touch targets, and existing business behavior.
5. **Prove changes are better on a pilot before touching all 47 routed pages.**

Standing decisions (user-approved): top-bar disclosure dropdowns (Requests · Work · Maintenance · Assets · Admin, Reports inside Work); new `/locations` index; **temporary recreated logo mark now with a single swap point, official assets swapped in when provided**; **lucide-react** as the single icon system.

### Repo state right now
- Branch `claude/sealtech-cmms-ui-redesign-ib55z9`, clean tree.
- Two local commits: `docs/UI_REVIEW.md` (static code audit — now an *input*, superseded as evidence by the rendered baseline below) and the brand-green `@theme` ramp in `globals.css` (kept; extended with semantic tokens in D-4).
- `git stash@{0}` = "phase6-component-consolidation-WIP": the Button/Input-`inline`/Alert sweep started earlier. **Not applied** until Phase 6, after the pilot confirms component appearance.
- Hard constraint: this environment cannot reach sealtechinsulation.com (network policy) — brand values come from the user's screenshot; official logo files come from the user later.

### Key codebase facts the plan builds on
- Next.js 16 App Router, React 19, Tailwind v4 CSS-first, zero UI deps; shell = `src/app/(app)/layout.tsx` (`main.max-w-6xl` — the single width rule to break up), topbar `src/components/nav.tsx` (async server, 15 flat links, no active state), bottom bar `src/components/field-nav.tsx` (5 emoji tabs).
- `npm run db:seed` builds representative data: 7 users across all 4 roles (admin/admin-demo-123, morgan, taylor, riley…), 2 sites, nested locations, 5 assets (parent/sub + photo), WOs in open/overdue/in-progress/on-hold/completed states + planned downtime, PM plan generated, meter with 5 readings + trigger, pending request.
- Playwright + preinstalled Chromium (`/opt/pw-browsers`); e2e server on :3100 (own DB), 95 e2e tests, 186 unit tests.
- `getLocationPath()` already exists in `src/server/services/locations.ts` "used for breadcrumbs" — breadcrumbs have a ready-made service.
- `getOrgSettings()` is request-cached only — root metadata must NOT hit the DB per request (D-10 fixes with `unstable_cache` + `revalidateTag`).

---

# Required planning deliverables

## D-1. Rendered baseline audit method (Phase 0)

Do not judge from source alone. Method:

1. `service postgresql start` → `npm run db:migrate && npm run db:seed` → `npm run dev` (port 3000, dev DB).
2. New harness `scripts/ui-baseline.ts` (tsx + `@playwright/test` **library** API, chromium at `/opt/pw-browsers/chromium`): loops role → login (seed creds) → screen inventory → viewport matrix; saves both viewport-clipped and full-page PNGs to `docs/ui-baseline/<role>/<screen>--<w>x<h>[--full].png`.
3. The same harness records per page, mechanically: `main` bounding box vs viewport (dead horizontal space %), `document.scrollHeight` vs viewport (below-fold %), count of elements matching loading/empty/error affordances, `<title>`, and horizontal-overflow check.
4. Manual review of every capture fills `docs/UI_BASELINE.md` — one entry per screen with the full required field list: main user + purpose, primary action, secondary actions, visible information, unused horizontal/vertical space, below-fold content, page-width restrictions, inconsistent spacing/components, navigation problems, missing loading/empty/error/success states, accessibility concerns, screenshot path(s).
5. Empty/error-state evidence: capture list pages twice — seeded and with a filter that returns nothing (`?q=zzz`) — plus `/forbidden`, and a bad route for the (missing) 404.

Viewports (fixed set, used everywhere in this project): **1440×900, 1280×800, 1024×768, 768×1024, 390×844 (touch), 360×800 (touch)**.

## D-2. Screenshot inventory

| Screen | Roles captured | Viewports |
|---|---|---|
| Login | (no role) | all 6 |
| Dashboard | admin, manager, technician, requester | all 6 |
| Schedule | admin, manager, technician | all 6 |
| Work-order list | admin, manager, technician | all 6 |
| Work-order detail (in-progress WO w/ procedure, photo, labor) | admin, technician | all 6 |
| Request list | admin, requester | all 6 |
| Request detail (pending "fridge leaking") | manager, requester | all 6 |
| Asset list | admin, technician | all 6 |
| Asset detail (compressor: photo, meter, history) | admin, technician | all 6 |
| Site detail (Main Plant location tree) | admin | all 6 |
| Meter list + meter detail | admin, technician | all 6 |
| PM list | admin, manager | all 6 |
| Reports | admin, manager | all 6 |
| Admin users | admin | all 6 |
| Technician mobile home (`/dashboard` FieldHome) | technician | 390, 360 |
| Technician mobile WO flow (list→detail→start→complete states) | technician | 390, 360 |
| Requester mobile flow (new request → list → detail) | requester | 390, 360 |
| Account/overflow page, notifications | technician | 390, 360 |

≈ 180 automated captures; committed under `docs/ui-baseline/` (they are the evidence record and the before-side of before/after).

## D-3. Role-based task scenarios & usability baseline (Phase 1)

Scenarios (exactly as specified):
- **Admin**: create site → location → asset; invite/create a user; locate an asset and print its QR label.
- **Manager**: find overdue work; create → assign → schedule a WO; review upcoming PM.
- **Technician**: find today's assigned work; open WO; start work; add note + meter reading + photo; complete WO.
- **Requester**: submit a request; find it later and check status.

Harness `scripts/ui-tasks.ts` drives each scenario with an instrumented page wrapper that records: **completion/failure, wall-clock time of the scripted run, click count, page-navigation count, backtrack count** (returns to an already-visited URL / `goBack`), and a per-step screenshot trail. Honest framing: scripted runs measure *interaction cost* (clicks, steps, navigation depth), not human time; **points of confusion and the 1–7 ease rating are recorded as reviewer judgments** in `docs/UI_BASELINE.md` (§ Task baseline table), with rationale, and the table has columns ready for real-user ratings if the user runs them. The identical scripts re-run after the pilot (Phase 4) and after final rollout (Phase 11) — same seed, same steps — so deltas are like-for-like.

## D-4. Design foundation (Phase 2)

**Semantic tokens** (added to `@theme` in `globals.css`, layered on the existing brand ramp — brand stays separate from operational status):

| Token | Value | Token | Value |
|---|---|---|---|
| `--color-app-bg` | gray-50 | `--color-action` | brand-800 `#2E7D32` |
| `--color-surface` | white | `--color-action-hover` | brand-900 `#1B5E20` |
| `--color-surface-raised` | white (+ shadow-sm recipe) | `--color-focus` | brand-600 `#43A047` |
| `--color-border` | gray-200 | `--color-selected` | bg brand-50 / text brand-800 |
| `--color-border-strong` | gray-300 | `--color-disabled` | gray-300 fg gray-400 |
| `--color-text` | gray-900 | `--color-success` | green-600 family (status, not brand) |
| `--color-text-muted` | gray-500 | `--color-warning` | amber-600 family |
| `--color-accent` | brand-500 `#4CAF50` (accents only) | `--color-danger` | red-700 family |
| `--color-header` | brand-950 `#123020` | `--color-info` | blue-600 family |

Tailwind v4 makes each a `bg-surface`/`text-action`/`border-border`-style utility. Components consume semantic tokens; the raw ramp is reserved for brand moments (header, logo, accents). Bright `#4CAF50` = accents only; `#2E7D32`+ for buttons/links/selected nav (AA-checked, contract already documented in the committed `@theme` comment).

**Logo assets** — `src/components/brand.tsx` + static SVGs, all with a `TEMPORARY MARK` comment and one swap point:
- Horizontal logo (wordmark + diamond) — light-bg and dark-bg variants (prop `onDark`)
- Compact app mark (diamond only) — mobile header, tight spaces
- `src/app/icon.svg` favicon (brand-950 tile + diamond)
- Print-safe version (grayscale-legible; used on QR labels and print views)
When official files arrive: drop them in `public/brand/`, point `brand.tsx` at them — nothing else changes.

**Icons**: add `lucide-react`; replace every emoji (🏠🔧📝📷👤🔔⚠✕ and the field-nav set) with one consistent 24px stroke set; icon-only controls get `aria-label`s. One shared `src/components/icons.ts` re-export module so the app imports icons from a single place.

## D-5. Page-layout templates (Phase 3) — built once, in `src/components/layout.tsx`

The single `max-w-6xl` on the shell is removed; the shell provides gutters (`px-4 sm:px-6 xl:px-8`) and each page picks a template:

- **DashboardGrid** — 12-col grid ≥1280px (`grid grid-cols-12 gap-4 xl:gap-6`), full desktop width (cap ~1600px); regions: at-a-glance stats row, needs-attention, upcoming work, overdue work, PM status, asset issues, quick actions. Every tile links to a decision/action — no decorative KPls.
- **ListLayout** — wide content (cap ~1500px); one toolbar recipe (search + filters + primary action, baseline-aligned); desktop = real table using available width with the important columns; mobile = record cards only below `md`; consistent pagination/empty/bulk-action slots.
- **DetailLayout** — ≥1024px: `grid lg:grid-cols-[minmax(0,1fr)_20rem]` main column + sticky status/actions rail; related records grouped; single consistent timeline/notes/attachments/history pattern. <1024px: single column, primary action reachable (sticky bottom action bar pattern already exists in `wo-forms.tsx` — generalize it), no horizontal scroll.
- **FormLayout** — readable width (`max-w-2xl`), logical sections, required-field marks (exists in `Field`), error summary + inline errors, sticky/visible save on long forms, unsaved-changes warning (`beforeunload` hook component) where destructive.

Consistent responsive gutters everywhere; **no single `max-w-*` for all page types**.

## D-6. Pilot screens & gate (Phase 4)

Pilot = exactly: **Dashboard (manager/admin + technician FieldHome), Work-order list, Work-order detail, Asset detail, Technician mobile home, Technician mobile WO flow.** (Asset *detail* chosen over list — it exercises DetailLayout, photos, meters, history; WO list already covers ListLayout.)

Pilot must demonstrate: desktop density, hierarchy, restrained brand color, logo, lucide icons, clear status treatment, improved actions, active nav state on the tabs/links it touches, loading/empty/error/success states for its routes, keyboard navigation, mobile usability.

Exit artifacts: before/after captures at all 6 viewports (harness re-run) + `docs/UI_PILOT_REVIEW.md` (side-by-side paths, task-metric deltas from D-3 re-run, deviations, open questions). **HARD STOP: no further rollout until the user reviews the pilot.**

## D-7. Desktop-density rules (Phase 7 rollout, by page family)

Order: 1 dashboards → 2 WO/request lists → 3 WO/request details → 4 asset/site/location pages → 5 maintenance (meters/PM/procedures) → 6 reports/imports/audit → 7 admin → 8 auth pages. One commit per family. Rules for every family: use available width via the D-5 templates; forms keep readable width; reduce card-in-card nesting (≤1 level); remove dead zones (baseline dead-space % is the check); align toolbar controls; key info above the fold at 1280×800; `min-h-11` targets everywhere; zero horizontal overflow (e2e-checked).

## D-8. Mobile identity & field usability (Phase 8)

Dark forest (`brand-950`) header with compact mark; lucide icons; branded active tab state (`aria-current` + brand-800 tint); WO/request cards get a **status rail** (3px left bar, always paired with the text badge — never color alone), priority + due chips with icons, overdue in red with label; asset photos (attachment thumbnails) with asset-type lucide icon fallback; strong primary action per screen; consistent card spacing; useful empty states with next-step actions. Brand green stays an accent — surfaces stay neutral. Stress fixtures added to a **supplementary seed** (`scripts/seed-stress.ts`, additive, never run in prod): 60-char asset names, deep location paths, missing photos, many attachments, multiple overdue WOs; plus fetch-failure messaging check (server-rendered app: test form-post failure and offline navigation behavior).

## D-9. Feedback & accessibility strategy (Phase 9)

Add: route `loading.tsx` (skeleton components) for `(app)` groups; `error.tsx` + `global-error.tsx`; `not-found.tsx`; save-in-progress states (extend existing `SubmitButton`); success confirmations as `role="status"` aria-live=polite (`StatusMessage` component — replaces ad-hoc `?saved=1` boxes); inline validation + form error summary; `/forbidden` gets a designed permission-denied treatment; destructive confirmation component (archive/delete/rollback actions); visible focus everywhere; skip-to-content link; `prefers-reduced-motion` honored (nav chevron/panel transitions); contrast checks (tokens are pre-checked; axe verifies pages); focus-not-obscured with sticky header + bottom nav (`scroll-margin-top/bottom` on focusables); labels for all icon-only controls. **Live-region policy: dynamic errors = `role="alert"`; dynamic success = polite status; static tinted boxes = no live region.** No status/selection by color alone (badges keep text; rails pair with badges).

## D-10. Locations page + branded outputs (Phase 10)

`/locations` index: `listLocationsBySite()` service (reuses tree assembly extracted from `getLocationTree`), shared `LocationTree` component (extracted from `sites/[id]/page.tsx:20-73`), guard `requireRole("admin","manager","technician")`, built on ListLayout + breadcrumb component (breadcrumbs also land on site/location/asset detail flows via existing `getLocationPath`). Then: login page (logo + org name), browser metadata via `generateMetadata()` reading org name through **`unstable_cache` tagged `org-settings` + `revalidateTag` in the settings save action + static fallback** (satisfies the no-per-request-DB-read requirement), favicon, transactional email templates (green CTAs + org name), QR asset labels (print-safe logo inside `main` — print CSS hides header/nav), print views.

## D-11. Revised commit sequence

| # | Commit | Gate |
|---|---|---|
| 0 | Plan doc (`docs/UI_REDESIGN_PLAN.md`) + baseline harness + `docs/ui-baseline/` captures + `docs/UI_BASELINE.md` | — |
| 1 | Task harness + task baseline table (in UI_BASELINE.md) | — |
| 2 | Semantic tokens + lucide-react + `brand.tsx` (temp mark) + `icons.ts` | typecheck/lint/unit |
| 3 | Layout templates (`layout.tsx` primitives) — no page conversions yet | full e2e |
| 4a–4c | Pilot: dashboard(s) → WO list/detail → asset detail + technician mobile home/flow; loading/error states for pilot routes | full e2e each |
| 4d | Before/after captures + task re-run + `docs/UI_PILOT_REVIEW.md` | **USER REVIEW — STOP** |
| 5 | Nav + shell: disclosure nav (WAI pattern, all listed requirements), breadcrumbs, header quick actions (New request / New WO / Scan / Add reading, role-aware), mobile overflow page grouped into labeled sections; e2e nav updates (navTo helper, 8 call sites, 86-field-shell rewrite) in same commit | full e2e |
| 6 | Shared components (apply + extend stashed WIP: Button, IconButton, Input/Select/Textarea + `inline`, Checkbox/Radio, Card, Alert, StatusMessage, Badge, StatTile merge, DataTable, EmptyState, Skeleton, PageHeader, Breadcrumb, FilterToolbar, Dialog + destructive confirm, TimelineItem, MobileRecordCard). Blue-* classified per use (brand interaction / info status / WO status / selection / chart / decorative) → correct semantic token; **no blind global replace** | full e2e |
| 7.1–7.8 | Density rollout, one commit per page family (D-7 order) | e2e + captures per family |
| 8 | Mobile identity pass + stress seed + stress checks | full e2e |
| 9 | Feedback & a11y pass (D-9) | full e2e + axe |
| 10 | `/locations` + branded outputs + cached org metadata | full e2e |
| 11 | Verification: new tests (below) + axe scans + visual baselines + task re-run + final report | all green |

New automated tests (commit 11 + alongside features): disclosure nav (open/close/Escape/outside/route-change, `aria-expanded`), keyboard behavior, active states (`aria-current`), role-specific nav (count-0 preserved), breadcrumbs, loading/error states, locations page, mobile nav, no horizontal overflow (existing, extended), ≥36px touch targets (existing), **axe scans** (`@axe-core/playwright`) on representative pages per family, **Playwright visual screenshots** (`toHaveScreenshot`) for representative families × roles on stable seeded data.

Full gate each run: `npm run typecheck && npm run lint && npm test && npm run test:e2e && npm run build` + axe + visual review. Push to `claude/sealtech-cmms-ui-redesign-ib55z9` at every gate.

**Success criterion** (user-defined): redesign ships only if the D-3 metrics improve (completion, interaction cost, backtracking, ease) or a neutral result is clearly documented and justified.

## D-12. Risks & rollback points

| Risk | Mitigation / rollback |
|---|---|
| Redesign looks better but tests worse | Pilot gate (4d) — task metrics compared before any rollout; rollback = revert 4a–4c, foundations (0–3) remain useful |
| Shell width change breaks pages not yet converted | Templates are opt-in per page; unconverted pages keep a compat `max-w-6xl` wrapper until their family commit |
| Visual regressions during rollout | Visual baselines recorded at pilot approval; every family commit diffs against them; one-commit-per-family = clean reverts |
| Dropdown grouping slows frequent destinations | Header quick actions + dashboard actions (D-11 #5); task metrics catch any regression |
| Temp logo mistaken for final | Marked TEMPORARY in code + PR notes; single swap point; user supplies official files any time |
| lucide-react dep concern | Tree-shaken imports only; ~1 icon = ~1kB; recorded in DECISIONS.md |
| Per-request DB hit from root metadata | `unstable_cache` + `revalidateTag("org-settings")` + static fallback |
| Live-region misuse (a11y regressions) | D-9 policy: alert only for dynamic errors; polite status for success; static boxes inert |
| e2e churn from nav collapse | navTo helper + enumerated 8 call sites + 86-field-shell rewrite ship inside the nav commit |
| Stash conflicts by Phase 6 | Stash applied early in a scratch check before Phase 6 to detect drift; if conflicted, redo mechanically from its diff (`git stash show -p`) |
| Container is ephemeral | Push at every gate; screenshots/docs committed, not just local |
