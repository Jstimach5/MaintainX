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
