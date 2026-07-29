# Production Audit

Date: 2026-07-29 · Branch: `claude/asset-tracking-software-lltwy3`

## Preservation record (§2)

- Working tree at audit start: **clean**, branch tracking origin, HEAD
  `1a3a7ba` pushed.
- Rollback point: commit **`9a7a52d`** ("Fix .gitignore…"), pushed to
  GitHub on the working branch. Local tag + local branch
  `pre-production-launch-2026-07` both point at it. *Constraint: this
  session's git access is scoped to the working branch only — tag and
  extra-branch pushes are rejected by the proxy, so the durable remote
  rollback reference is the commit SHA on the pushed branch.*
- Suites at audit start: 159/159 unit + 88/88 Playwright recorded at
  `0c78247` (only docs changed between it and `1a3a7ba`); unit suite
  re-run at `9a7a52d` — result in PRODUCTION_TEST_LOG.md.
- Upload/DB persistence across restart: verified previously (TEST_LOG
  Phase 4 picture-survives-restart; Phase 11 backup/restore with identical
  row counts); re-verified during this launch cycle.

## Verification of prior-session claims (§3)

| Claim | Reality here |
|---|---|
| Local commit `24f2a1e` exists | **Does not exist** in this repository's history — it came from a different (local) session. Its *intent* is superseded by `9a7a52d` below. |
| `src/server/storage.ts` contains the adapter | The adapter lives at `src/server/storage/index.ts` (a directory module) and works — every attachment feature and its tests run through it. |
| `.gitignore` should contain `/storage/` not a bare rule | **Confirmed and fixed.** The bare `storage/` rule matched every directory named storage; `git ls-files` proved `src/server/storage/` had **never been committed** — clean clones and GitHub ZIP downloads were missing the storage adapter and could not build. Fixed in `9a7a52d`: rule anchored to `/storage/` (repo-root uploads dir), module tracked and pushed. |
| GitHub 403 / read-only remote | Not reproduced — pushes from this session succeed (proof: `9a7a52d` on origin). |

`git remote -v` → the session's authenticated proxy for
`Jstimach5/MaintainX`. No `.env`, no database files, no uploaded pictures
tracked (`/storage/`, `.env` ignored; probe-verified). `gh` CLI is not
available in this environment; GitHub operations go through the session's
git remote and GitHub MCP tools.

## What already meets the production requirements

- **Auth**: scrypt password hashing (maxmem + timing-safe compare), DB
  sessions hashed at rest, revocation on deactivate/password reset,
  backend RBAC on every action (Scenario F verified).
- **Storage**: adapter-based local disk, allowlisted types, 25 MB cap,
  auth-gated serving with re-checked MIME + nosniff; file⟺row invariant.
- **Database**: 13 migrations replay cleanly from empty; idempotency by
  DB constraint (PM, meter triggers, imports, request conversion).
- **Docker**: compose with named volumes (`db_data`, `storage_data`),
  DB not port-exposed, healthchecked postgres:16, worker process.
- **Backups**: `scripts/backup.sh` (pg_dump custom + storage tarball,
  retention); restore executed and verified (Phase 11).
- **Audit**: append-only audit_events on every mutation.
- **Rate limiting**: login throttle + portal rate limit (in-memory,
  single-process — acceptable for this deployment shape).

## Gaps this launch cycle must close (§4–§17)

1. **No email** — `notifications.ts` SMTP adapter is a console stub
   (`src/server/services/notifications.ts:32`). No invitation emails, no
   reset emails.
2. **No invitation system** — admins create users with passwords by hand;
   no tokenized invite/accept flow, no invitation audit trail.
3. **No self-serve password reset** — admin-set temporary passwords only;
   no forgot-password page, no forced change at first login.
4. **No `APP_URL`** — nothing generates absolute links yet (needed for
   invitation/reset links; must never be localhost in production).
5. **No health endpoint** — compose healthcheck covers postgres only.
6. **Seed not production-guarded** — `npm run db:seed` would happily wipe
   a production database if mis-run.
7. **No production compose** — dev compose lacks reverse proxy/HTTPS,
   pinned app image discipline, non-root user, restart policies on all
   services, private network separation.
8. **No production docs set** — DEPLOYMENT.md predates the mobile work;
   TEAM_ONBOARDING.md, PRODUCTION_* docs, asset onboarding guide missing.

## Explicitly out of scope for this cycle (recorded, not hidden)

- **Per-site user permissions**: the RBAC model is role + team;
  site-scoped ACLs are not part of the architecture and bolting them on
  now would violate the "smallest reliable change" constraint. Invitations
  carry role + team. Documented as a known limitation.
- **Asset CSV importer**: the bulk importer is work-order-scoped. Per the
  launch prompt, asset onboarding ships as a guide + template
  (docs/ASSET_ONBOARDING_GUIDE.md, docs/ASSET_IMPORT_TEMPLATE.csv), not a
  new importer.
- **Object storage**: local-disk adapter stays for the small-team launch
  (persistent volume, permission-gated, backed up); the adapter interface
  is the documented seam for S3-compatible storage later.
- **What only the operator can do**: VPS provisioning, DNS, SMTP
  credentials, and on-device phone testing — consolidated in the launch
  plan's credentials list.
