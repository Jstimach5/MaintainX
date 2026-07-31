# UI Review — Seal Tech CMMS

Review date: 2026-07-31
Scope: the app shell, all 47 routed pages, the shared component kit
(`src/components/`), global styles, and the constraints encoded in the
Playwright/vitest suites. Judged against standard UI heuristics: visual
hierarchy, consistency, navigation & information architecture, feedback,
accessibility, branding, responsiveness.

This review is the "what needs to change" deliverable that precedes the
Seal Tech rebrand + navigation redesign. Findings are labeled (B/N/C/A)
so later commits can reference them.

## Brand reference

Extracted from sealtechinsulation.com (screenshot-sampled; the deploy
environment's network policy blocks fetching the site directly):

- Logo: metallic silver-gray "SEAL TECH" caps with a green faceted diamond
  between the words; "INSULATION" small letter-spaced caps beneath.
- Grass green (site nav, CTA buttons): ~`#4CAF50`. Note: white text on
  `#4CAF50` is ~2.9:1 — fails WCAG AA for body-size text, so the app must
  anchor interactive elements on a darker shade and reserve the bright
  green for accents.
- Dark forest green (hero backgrounds): ~`#0E2A1B`–`#123020`.
- Light green (stats band): ~`#66BB6A`.
- Motifs: dropdown carets in the nav; dark-green rounded-full pills with
  white text; solid green primary CTA + white-outline secondary; uppercase
  letter-spaced bright-green eyebrow labels; large white stat numbers on
  green.

## What the app already does well (keep, don't regress)

- **Disciplined semantic palette** — only 6 color families in the whole
  app (gray/blue/red/amber/green/purple) with consistent meanings
  (blue=interactive, red=danger/overdue, amber=warning/in-progress,
  green=success, purple=special-state). The rebrand can re-point
  "interactive" cleanly without disturbing status semantics.
- **Centralized status→color maps** next to each enum (work-order status,
  asset status, request status, import status), all rendered through one
  `Badge` component.
- **44px touch targets are contractual** (`min-h-11` on buttons/inputs;
  e2e asserts ≥36px) — field technicians on phones.
- **`PageHeader` adopted by all 47 app pages** — a single H1 idiom inside
  the app.
- **Server-enforced permissions everywhere**; hiding nav links is
  convenience, not security. Navigation can be restructured freely with no
  security implications.
- Print stylesheet (verified P1 feature), iOS anti-zoom base font,
  safe-area insets on the bottom tab bar.

## B — Branding & identity (the biggest gap)

| # | Finding | Evidence |
|---|---|---|
| B1 | No brand asset exists at all: no logo, no favicon, no `public/` directory, no `src/app/icon.*`, zero image/svg/font files in the repo. The browser tab shows a blank default icon. | repo-wide glob |
| B2 | The app calls itself hardcoded "Maintenance Manager" in the header wordmark (`src/components/nav.tsx:37-42`), the login subtitle (`src/app/(auth)/login/page.tsx:20-23`), and the `<title>` (`src/app/layout.tsx:5`) — while the admin-editable org name stored in the DB (`org_settings.name`) is never rendered anywhere in the chrome. | `src/server/services/org.ts` |
| B3 | The brand color is generic Tailwind blue (`bg-blue-700` buttons, `text-blue-800` wordmark/links) — no relation to Seal Tech's green identity. | `src/components/ui.tsx:56-64` |
| B4 | Transactional emails carry the same generic blue (`#1d4ed8` CTA buttons) and no company identity. | `src/server/email/index.ts:160,191` |
| B5 | The printable QR asset label — a physical, customer-visible artifact — has no logo or company identity. | `src/app/(app)/assets/[id]/label/page.tsx` |

## N — Navigation & information architecture

| # | Finding | Evidence |
|---|---|---|
| N1 | The desktop nav is a flat row of 15 links that horizontally scrolls (`overflow-x-auto`, `whitespace-nowrap`) — no grouping, no hierarchy; admins must scan all 15 every time. Already flagged in the project's own mobile audit. | `src/components/nav.tsx:43-54`, `docs/MOBILE_AUDIT.md:61-63` |
| N2 | No active state anywhere — zero `aria-current`/`usePathname` in the codebase. Users get no "you are here" signal in either the top bar or the mobile tab bar. | repo-wide grep |
| N3 | No dropdown/disclosure pattern exists (no `<details>`, no `aria-expanded` in the whole app) — the requested grouping is a net-new primitive. | repo-wide grep |
| N4 | Nav ordering is arbitrary (array order), unrelated to frequency of use or task grouping. | `nav.tsx:13-29` |
| N5 | No `/locations` index — locations are reachable only by drilling into a site. | route map |
| N6 | The mobile overflow menu (`/account` link list) uses a different label vocabulary than the top nav ("Maintenance plans" vs "PM", "Sites & locations" vs "Sites") — same destinations, different names. | `src/app/(app)/account/page.tsx:32-48` |
| N7 | No `loading.tsx`/`error.tsx`/`not-found.tsx` anywhere — slow navigations give no feedback; errors fall through to the framework default. | repo glob |

## C — Consistency & cohesion (formatting)

| # | Finding | Evidence |
|---|---|---|
| C1 | The primary button's classes are re-implemented raw 12× instead of using `Button`; the secondary button 5×; the input style ~31×; the card 10×. Any restyle done naively would miss these. | e.g. `work-orders/page.tsx:123`, `assets/page.tsx:106`, filter toolbars |
| C2 | Five different alert/banner recipes for the same job (error/success/warning boxes with varying borders, padding, tones) — 26 hand-rolled tinted boxes, no `Alert` component. | `forms.tsx:30` vs `admin/settings/page.tsx:27` vs `invite-forms.tsx:38` |
| C3 | Interactive-link color split: `text-blue-700` (32×, prose links/ghost buttons) vs `text-blue-800` (24×, list-row title links) plus stray `blue-600`/`blue-900` one-offs. | color audit |
| C4 | Two near-identical stat-tile components with divergent tone vocabularies (`StatTile`: default/bad/good vs `CountTile`: default/bad/warn). | `components/charts.tsx:15`, `dashboard/field-home.tsx:14` |
| C5 | Auth/standalone pages drift: login is `max-w-sm` with no card; setup/forgot/reset/invite/change-password are `max-w-md` with cards; six ad-hoc H1 variants; 4 pages use `min-h-screen` (mobile-Safari viewport jump) instead of the intended `min-h-dvh`. | login vs siblings |
| C6 | Emoji are the entire icon system (🏠🔧📝📷👤🔔⚠✕) — they render differently per platform, can't take brand color, and look unpolished next to a branded UI. | `field-nav.tsx`, `nav.tsx:60` |
| C7 | Charts hardcode 9 hex values incl. `BAR_HUE="#1d4ed8"`; emails hardcode blue hex — both bypass any token system and would silently keep the old brand. | `components/charts.tsx:13,154-180`, `server/email/index.ts` |
| C8 | Tables are ad-hoc (4 different header treatments); one-off segmented controls on Schedule; H2s rely on inherited size (`mb-2 font-semibold` with no `text-*`). | schedule/reports/meters/imports |
| C9 | No design tokens: `globals.css` has a single `@theme` variable (the font). Colors live as raw utility classes in ~50 files plus string constants in `ui.tsx`. | `src/app/globals.css` |

## A — Accessibility

| # | Finding |
|---|---|
| A1 | No `aria-current="page"` anywhere (ties to N2). |
| A2 | Bright brand green `#4CAF50` cannot carry small white text (2.9:1); the redesign must use a darker green (≥`#2E7D32`, 5.1:1) for buttons/links and keep `#4CAF50` for accents/large numerals — otherwise the rebrand would *worsen* accessibility. |
| A3 | New dropdowns must add the app's first `aria-expanded` handling, Escape-to-close, and focus management — nothing exists to copy from. |
| A4 | Emoji icons have inconsistent screen-reader behavior; a real icon treatment with explicit labels is cleaner. |

## Summary — what will change

1. **Brand foundation**: design tokens (`@theme` green ramp + documented
   contrast contract), SVG logo + favicon, org-name wiring, email + chart +
   label branding.
2. **Navigation**: grouped dropdown top bar (Requests · Work · Maintenance ·
   Assets · Admin), active states everywhere (top bar + mobile tabs),
   aligned `/account` overflow labels, new `/locations` index page.
3. **Cohesion sweep**: all duplicated buttons/inputs/cards onto the
   `ui.tsx` primitives; one `Alert` component; one stat-tile; one link
   color; auth-page alignment; `min-h-dvh`.
4. **Out of scope (unchanged)**: business logic, permissions, schema, the
   5-tab mobile bar structure, print styles, the requester/technician page
   flows.
