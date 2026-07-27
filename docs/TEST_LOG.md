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
