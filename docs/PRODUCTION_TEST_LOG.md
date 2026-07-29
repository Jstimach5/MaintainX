# Production Test Log

Evidence for the launch cycle. Same rule as TEST_LOG.md: nothing is
marked done from code inspection alone.

---

## P0 — Audit + preservation

### 2026-07-29

- `git status` clean at `1a3a7ba`; branch `claude/asset-tracking-software-lltwy3`
  tracking origin.
- **Found + fixed:** bare `storage/` gitignore rule had excluded
  `src/server/storage/index.ts` from **every commit to date** — clean
  clones/ZIPs could not build (`git ls-files` count for the directory was
  0; probe-file check-ignore confirmed). Fixed and pushed as `9a7a52d`
  (rule anchored to `/storage/`, module tracked).
- Rollback point `9a7a52d` pushed; local tag + branch
  `pre-production-launch-2026-07` (remote tag/branch pushes rejected by
  the session's branch-scoped git proxy — SHA is the durable remote
  reference).
- Claim checks: `24f2a1e` not in this history; adapter path is
  `src/server/storage/index.ts`; remote push access works.
- `npm test` at `9a7a52d`: **159/159** (after restarting the sandbox's
  Postgres service, which had idled — ECONNREFUSED on first attempt was
  environmental, not a product failure).
- 88/88 Playwright recorded at `0c78247`; only docs changed since.

---

## P1+P2 — Invitations, email, password reset

### 2026-07-29

- **Unit:** `npm test` → **186/186** (17 files; adds invitations 12,
  email 7, password-reset 8). Email tests use an injected mock transport —
  no real SMTP anywhere in the suite.
- **Browser:** `npx playwright test` → **95/95** across desktop, Pixel 7,
  iPhone 14, Galaxy S8, iPad Mini. New coverage: admin invite → one-time
  link reveal (copy-link fallback verified with email unconfigured) →
  clean-context acceptance → signed in with invited role; used link
  refused; revoke kills the link immediately; resend mints a new token
  and the old dies; forgot-password answers identically for unknown
  accounts; first login with an admin-set password is forced through
  /change-password (two flows, spec 00 + spec 30).
- **Ripples handled:** e2e specs updated for the renamed "Add manually"
  button and the forced-change gate; seed clears the force flag so demo
  logins stay usable; `asSession` helpers gained the new field.
- **Backup/restore:** invitation created through the real service →
  `scripts/backup.sh` → restore into a scratch DB → row and 64-char token
  hash intact.
- **Migrations (§9):** 0013 applied to (1) a clean empty DB — 38 tables;
  (2) a dump-restored copy of the seeded trial DB — clean no-op re-run,
  7 WOs / 7 users preserved. Rollback: restore the pre-migration backup
  (procedure in BACKUP_AND_RESTORE.md).

## P3+P4 — Production configuration and deployment artifacts

### 2026-07-29

- **/api/health:** verified against a real `next start` process: 200
  `{ok:true,db:true}` with Postgres up; **503** `{ok:false,db:false}`
  with Postgres stopped; back to 200 on recovery.
- **Seed guard:** refuses under NODE_ENV=production (SEED_FORCE=1
  escape hatch documented).
- **compose:** `docker compose -f docker-compose.prod.yml config`
  validates (daemon unavailable in this sandbox — image build itself is
  verified indirectly via `next build` and the clean-clone build; first
  live `up` happens on the real server).
- **Secret scan before push:** staged diff scanned; only intentional test
  fixtures and documented demo passwords matched. Caught and fixed: the
  `backups/` directory was committable — now git- and docker-ignored.
- **Clean-clone gate (§15):** `git clone` of HEAD → storage module
  present (the P0 fix holding), `npm ci`, `next build`, migrate + seed
  onto a fresh DB (7 WOs) — all green. **The gate caught a
  production-blocking bug:** with no DATABASE_URL (exactly the docker
  image-build condition, since `.env` is rightly excluded from the build
  context), `next build` failed collecting /reports/export — the db pool
  was created at module import. Fixed: pool is now created on first use
  (same clear error, correct moment) and the export route is explicitly
  dynamic. `env -u DATABASE_URL npm run build` now passes; 186/186 unit
  re-run over the lazy pool; final full Playwright gate recorded below.

## P5 — Final gate

### 2026-07-29

- Full Playwright suite over the lazy-pool + dynamic-export fix:
  **95/95** across all five device projects. Unit **186/186**.
  `env -u DATABASE_URL npm run build` clean. Working tree fully
  committed and pushed after this entry.
- What remains is operator-gated (VPS, DNS, SMTP, on-device phone test
  over mobile data) — consolidated in the launch report and
  PROJECT_STATE.md. Everything executable in this environment for the
  §23 definition of done has been executed and recorded above.
