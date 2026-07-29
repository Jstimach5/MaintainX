# Production Launch Plan

Working order for the launch cycle (§22 loop runs inside each phase;
evidence lands in PRODUCTION_TEST_LOG.md).

| Phase | Scope | Gate |
|---|---|---|
| P0 | Audit, preservation, `.gitignore`/storage fix, rollback point | Suites green at rollback commit; fix pushed |
| P1 | Invitations: schema+migration 0013, service (hashed one-shot expiring tokens), Admin → Users → Invite flow (send/resend/revoke/copy-link/history), public acceptance page, rate limiting, audit | Unit + e2e green |
| P2 | Email: nodemailer adapter (dev/prod modes, verify, text+HTML, mock-transport tests); forgot-password + hashed reset tokens + session invalidation; mustChangePassword for manual accounts | Unit + e2e green |
| P3 | Production config: APP_URL, env documentation + startup validation, /api/health, seed production guard | Build green; health returns DB status |
| P4 | Deployment: docker-compose.prod.yml (Caddy auto-HTTPS, pinned images, non-root, healthchecks, restart, private network, persistent volumes), Dockerfile hardening, deploy/update/rollback commands | Compose config validates; images build |
| P5 | Verification: migration on clean + trial-copy + populated DBs; clean-clone build; backup/restore incl. invitations; full unit + e2e | All green, recorded |
| P6 | Docs: TEAM_ONBOARDING, ASSET_ONBOARDING_GUIDE + template CSV, DEPLOYMENT rewrite, rollback plan, PROJECT_STATE; consolidated operator-credentials list; §24 report | Definition of done (§23) items that are executable in this environment all pass |

**Held for the operator (single consolidated list at the end):** VPS +
SSH, domain/DNS record, SMTP credentials, on-device phone test over
mobile data, real-admin creation on the live host.

Architecture decisions for launch (recorded in DECISIONS.md when
implemented): invitation/reset tokens stored as sha256 hashes with
partial-unique one-shot acceptance (same idempotency-by-constraint rule
as #6); email adapter behind the existing notification seam with an
injectable transport; Caddy as reverse proxy (auto-HTTPS, two-line
config); per-site permissions and object storage deliberately deferred.
