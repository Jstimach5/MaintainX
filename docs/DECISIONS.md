# Architecture Decisions

Format per master prompt §18: problem, options, decision, reason, tradeoff,
future consequence. Decisions are not revisited without new evidence.

---

## 1. Technology stack (2026-07-27)

**Problem.** The repository was empty; the spec (§3) requires a typed
frontend and backend, relational DB, migrations, file storage, background
jobs, automated testing, containerized dev, env config — chosen for
maintainability by a small internal team.

**Options considered.**
1. Next.js (App Router) + TypeScript + Postgres + Drizzle + pg-boss
2. Separate Express+TS API and React+Vite SPA
3. Server-rendered Node/Express + EJS + SQLite (an earlier lean draft)

**Decision.** Option 1.

**Reason.** One typed codebase covers UI and backend (server components +
server actions), eliminating an API-contract layer to maintain. Postgres
supports concurrent writers (web + worker) and backs pg-boss, so background
jobs need no Redis. Drizzle produces plain SQL migrations that run on a clean
database. Option 3 failed the spec's typed/background-jobs/containerized
requirements; option 2 doubles the surface without adding capability.

**Tradeoff.** Next.js is a heavier framework than the problem strictly needs,
and framework upgrades are a recurring cost.

**Future consequence.** All server logic lives in `src/server/services/*` as
framework-independent functions, so a future framework migration would only
replace the route/action layer.

## 2. Dev/test database vs. deployment database (2026-07-27)

**Problem.** The build sandbox has a local PostgreSQL 16 server but no
running Docker daemon; production should be simple to operate.

**Decision.** Development and CI-style tests run against local Postgres
(`cmms_dev` / `cmms_test`); deployment uses `docker-compose.yml` (postgres +
app + worker, with named volumes and healthchecks). Same major version (16)
in both, so behavior matches.

**Tradeoff.** The compose file cannot be fully exercised in this sandbox
(daemon unavailable); it is kept minimal and standard to reduce risk, and
must be smoke-tested on the first real deployment.

## 3. Sessions and password hashing (2026-07-27)

**Problem.** §16 requires secure password storage and session expiration; no
external identity provider exists.

**Decision.** Hand-rolled DB-backed sessions: 256-bit random token in an
HttpOnly SameSite=Lax cookie, sha256(token) stored in `sessions` with expiry;
passwords hashed with Node's built-in `crypto.scrypt` (per-user salt, params
encoded in the hash string, explicit `maxmem`, buffer-length check before
`timingSafeEqual`). Session lookup joins `users.is_active = 1`; deactivating
a user or resetting a password deletes that user's sessions in the same
transaction.

**Reason.** No new dependencies; server-side revocation works (deactivation
is the offboarding mechanism and must cut access immediately, not when a
30-day cookie expires). Auth libraries in this ecosystem churn quickly;
80 lines of owned code is cheaper than tracking one.

**Tradeoff.** We own the security-sensitive code; mitigated with dedicated
unit tests (token entropy, expiry, revocation, scrypt edge cases).

## 4. Parts-module extension points (deferred, do not build) (2026-07-27)

**Problem.** Parts/inventory is P2, but the WO/asset schema must not need a
rewrite when it arrives.

**Decision.** The following seams are reserved and documented, not built:
- `work_orders` carries its own cost fields (labor, other) that do not
  depend on parts; a future `work_order_parts` join table adds part costs
  additively.
- Attachments, comments, and audit events are polymorphic
  (`entity_type`/`entity_id`), so `part`/`purchase_order` entity types slot
  in without schema changes to those tables.
- Future tables sketched (names only): `parts`, `inventory_locations`,
  `part_stock`, `work_order_parts`, `vendors`, `purchase_orders`.
- No UI reserves space for parts; navigation is data-driven and additive.

**Future consequence.** Adding parts is a new migration + new routes/services;
no existing table is altered except additive columns.

**Amendment (2026-07-28, Phase 14).** `work_order_parts` now exists — but as
**usage documentation only** (free-typed name, quantity, unit cost entered by
the technician), not inventory. Nothing references a catalog or stock level,
so the deferral stands. When the inventory module arrives it adds a nullable
`part_id` FK to these rows and treats name/cost as the as-used snapshot;
no rewrite of the work-order system is needed — exactly the seam this
decision reserved.

## 4b. Mobile field application on the same backend (2026-07-28)

**Problem.** Field employees need to run their whole day from a phone —
including in areas with poor connectivity — without the office system and
the phones drifting into two separate sources of truth.

**Decision.** A responsive PWA inside the existing Next.js app: same
routes, same session, same database, same services. Small screens get
field-first navigation (a five-slot bottom bar) and field screens; desktop
keeps the full chrome. Reporting, imports, and administration stay
desktop-shaped.

Offline-capable mutations will go through JSON route handlers under
`/api/field/*` rather than server actions, because a queued change must be
replayable and server actions are not. Each carries a client-generated
idempotency key enforced by a unique index (the same rule as #6), so a
retry after a dropped connection can never double-post. Conflicts return
409 with the server's state and are surfaced, never silently merged.

**Alternatives rejected.** Native iOS/Android apps (two more build chains
to maintain for a small internal shop); a separate mobile frontend against
the same API (duplicate permission logic, guaranteed drift).

**Consequence.** One codebase and one permission surface. The cost is that
offline support has to be built deliberately per action rather than coming
free from a client-side data layer.

## 4c. Labor timers produce ordinary labor rows (2026-07-28)

**Problem.** A running timer is stateful, but every report already reads
`work_order_labor`.

**Decision.** `work_order_timers` records the running clock only; stopping
converts elapsed time into a normal `work_order_labor` row. A partial
unique index on `(user_id) WHERE stopped_at IS NULL` is what actually
prevents one person from running several clocks at once — not application
checks. Sub-minute timers log nothing rather than rounding up to a minute
that was not worked.

**Consequence.** Reporting, exports, and KPIs needed no changes.

## 5. Timezone and calendar-date rules (2026-07-27)

**Problem.** Due dates, PM occurrence dates, and "overdue" checks are
calendar-date concepts, but timestamps are UTC. Deriving "today" from UTC
makes work flip overdue at ~5–7 pm US local time; PM recurrence must survive
DST.

**Decision.** All timestamps are `timestamptz` (UTC). All calendar dates are
Postgres `date` columns. "Today" and all date arithmetic are computed in the
**org timezone** (IANA name in `org_settings.timezone`, set during first-run
setup, defaulting to the server's zone) via a single shared date helper
module. `date('now')`-style SQL and `new Date().toISOString().slice(0,10)`
are banned for calendar logic. PM recurrence advances dates in org-TZ
calendar space (DST-safe), never by adding 86400-second multiples.

**Future consequence.** Multi-site-across-timezones would require per-site
timezone columns; the helper takes the zone as a parameter so that change
stays local.

## 6. Idempotency via database constraints (2026-07-27)

**Problem.** §9/§10/§12 demand no-duplicate guarantees for PM generation,
meter triggers, and imports — under retries, crashes, and double-runs.

**Decision.** Every at-most-once behavior is enforced by a unique constraint,
not by application checks alone: PM occurrences `UNIQUE (plan_id,
occurrence_key)`; meter triggers carry a `last_fired_reading_id` watermark
plus a unique constraint on (trigger_id, reading_id) for fired events;
imports are idempotent on (import_key, row external_id/duplicate strategy).
Job handlers treat unique-violation as "already done, skip".

**Future consequence.** Retried pg-boss jobs are safe by construction; a
crashed worker resuming mid-batch cannot double-create work orders.

## 7. One icon system: lucide-react (2026-07-31)

**Problem.** The interface carried roughly 40 distinct emoji as icons
(🔧 📋 ⚠️ …). Emoji render as the *operating system's* glyph, so the same
screen looks different on Windows, macOS, and Android; several render in
colour that fights the status palette; screen readers announce their
Unicode names ("wrench", "warning sign") in the middle of sentences; and
they cannot inherit `currentColor` or a stroke weight.

**Options considered.**
1. `lucide-react` — MIT, tree-shaken per-icon, stroke-based, sized in `em`.
2. Hand-authored SVG sprite maintained in-repo.
3. An icon font (Font Awesome et al.).

**Decision.** Option 1, re-exported through a single curated module,
`src/components/icons.ts`. Nothing imports `lucide-react` directly.

**Reason.** The curated module is what makes this a *system* rather than a
dependency: the set of icons in use is one file long, so a reviewer can see
the whole vocabulary, and swapping libraries later touches one file. Icons
inherit `currentColor`, so the semantic tokens keep working. Option 2 is the
same result with ongoing drawing work; option 3 ships an entire font for a
few dozen glyphs and fails at `font-display` boundaries.

**Tradeoff.** A runtime dependency on a third-party icon set, and every icon
must be added to the curated module before use (deliberate friction).

**Consequence.** Icons are decorative by default (`aria-hidden`) and are
always paired with text, so removing an icon can never remove meaning.

## 8. Page width comes from a layout template, not a global cap (2026-07-31)

**Problem.** Every page was wrapped in the same `max-w-6xl` container. The
rendered baseline (`docs/UI_BASELINE.md`) measured the result: on a 1440px
desktop, list and dashboard screens used ~80% of the viewport and folded at
a ratio of 1.0 — the reader saw one screen of content and a wide empty
gutter, while the same cap left detail pages cramped.

**Options considered.**
1. Widen the single global cap.
2. Per-page `max-w-*` chosen ad hoc at each call site.
3. Four named layout templates, selected by page family via route groups.

**Decision.** Option 3 — `DashboardGrid` (12-column, 1600px), `ListLayout`
(1500px), `DetailLayout` (main + sticky rail at `lg`+), `FormLayout`
(`max-w-2xl`), in `src/components/layout.tsx`. Route groups give each page
family its own layout file, so the template is structural rather than a
class a page author has to remember.

**Reason.** Width is a property of *what a page is for*, not of the app. A
table wants horizontal room; a form does not — a 1500px-wide input row is
measurably harder to fill in than a 640px one. One rule cannot serve both,
which is why option 1 fixes lists by breaking forms. Option 2 is how the
inconsistency arose in the first place.

**Tradeoff.** Adding a page means choosing a family, and the route-group
directory layout is one level of indirection between URL and file.

**Consequence.** Density work is now per-family and measurable: the
before/after fold ratios in `docs/UI_FINAL_REPORT.md` are comparable because
every page in a family shares one container.

## 9. No route-level `loading.tsx` on Next 16.2.12 (deferred) (2026-07-31)

**Problem.** Adding route-level `loading.tsx` files — the ordinary way to
give a route a skeleton — intermittently hung the response stream of
*server actions* on that route: the action ran to completion on the server
(the write landed) but the client never received the response, so the form
sat spinning forever.

**Evidence.** Bisected with a three-round reproducer (abort an in-flight RSC
prefetch, then submit a server action): 2/3 rounds hung with `loading.tsx`
present, 0/3 with it removed, 0/3 with `error.tsx` alone, 0/3 on the
pre-pilot tree. `not-found.tsx` was tested separately and was clean (0/3),
so it ships.

**Decision.** Ship without route-level `loading.tsx`. Perceived-performance
work uses the `Skeleton` component inside already-rendering pages instead.

**Reason.** A hung write is a data-integrity-shaped bug from the user's
point of view — they retry, and now they cannot tell whether they created
one record or two. A missing skeleton is a cosmetic regression. The trade is
not close.

**Tradeoff.** Navigations to slow routes show the previous page for longer
with no route-level pending state.

**Future consequence.** Re-test on the next Next.js minor — the reproducer
is written up in `docs/UI_PILOT_REVIEW.md` § F1. If a release fixes it, the
`loading.tsx` files can be added back with no other change.
