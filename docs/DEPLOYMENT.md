# Deployment

## What you're deploying

Three processes, one database, one file directory, one reverse proxy:

| Piece | Role |
|---|---|
| Caddy | HTTPS termination, HTTP→HTTPS redirect, the ONLY public port |
| `next start` (app) | The web application (internal port 3000) |
| `npm run worker` | Background jobs: PM generation, session cleanup |
| PostgreSQL 16 | All records (never publicly exposed) |
| `STORAGE_DIR` volume | Uploaded pictures/files |

```
phone / computer → HTTPS → your-domain → Caddy → app → private Postgres
                                                   ↘ persistent volumes
```

## Production — docker-compose.prod.yml (recommended)

On an always-on Linux server (a small VPS is fine — 2 GB RAM, 2 vCPU,
40 GB disk) with Docker Engine + the compose plugin installed:

```bash
git clone -b claude/asset-tracking-software-lltwy3 https://github.com/Jstimach5/MaintainX.git /opt/cmms
cd /opt/cmms
cp .env.example .env
# Edit .env and set at minimum:
#   POSTGRES_PASSWORD   (generate: openssl rand -base64 32)
#   APP_DOMAIN          e.g. cmms.example.com
#   APP_URL             https://cmms.example.com  (same domain, with scheme)
#   ACME_EMAIL          your email (certificate expiry notices)
#   SMTP_*              if invitations/resets should go by email
docker compose -f docker-compose.prod.yml up -d --build
```

Prerequisite: a DNS **A record** pointing `APP_DOMAIN` at the server's IP.
Caddy then obtains and renews the HTTPS certificate automatically; HTTP
redirects to HTTPS; the app sets Secure cookies (`COOKIE_SECURE=1` is set
by the compose file).

First run: migrations apply automatically, then the first visit to the
HTTPS URL is the one-time setup page — create the organization and your
administrator account **immediately** (until then, anyone who can reach
the URL could claim it). Do NOT run the demo seed in production (it
refuses with `NODE_ENV=production` anyway).

### Day-2 commands

```bash
# Status / health / logs
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail 100 app worker caddy
curl -s https://<your-domain>/api/health

# Update to a new release
cd /opt/cmms && git pull && docker compose -f docker-compose.prod.yml up -d --build

# Rollback to a known-good commit
git checkout <last-good-sha> && docker compose -f docker-compose.prod.yml up -d --build
# (Restore the matching DB backup first if the bad release migrated the
#  schema — see docs/BACKUP_AND_RESTORE.md.)

# Backups (add to cron; see scripts/prod-backup.sh header)
scripts/prod-backup.sh
```

### Server hardening checklist

- SSH: key-based auth, password login off.
- Firewall (ufw or the provider's): allow 22, 80, 443 only.
- Do not publish ports for db or app in compose (the shipped file
  doesn't); never mount the Docker socket anywhere.
- Keep `.env` readable by the deploy user only (`chmod 600 .env`).
- Backups run from cron and at least one copy leaves the server
  (`rsync`/`rclone` — see BACKUP_AND_RESTORE.md).

## Dev / LAN trial — docker-compose.yml

The original single-site compose (no proxy, plain HTTP on port 3000)
remains for local trials — docs/TEST_RUN.md is the guided version.

```bash
cp .env.example .env        # set POSTGRES_PASSWORD
docker compose up -d --build
```

## Option B — bare Node on a server

Prereqs: Node 22.9+, PostgreSQL 16, a database + role, a process manager.

```bash
npm ci
npm run build
npm run db:migrate
npm run start          # app  (systemd/pm2 both fine)
npm run worker         # worker (second unit/process)
```

Put your own TLS reverse proxy (Caddy/nginx) in front and set `APP_URL`,
`COOKIE_SECURE=1`, and the SMTP variables in the environment.

## Health checks

`GET /api/health` → `{ ok: true, db: true }` with HTTP 200 when the app
can reach the database; 503 otherwise. The prod compose file wires this
into Docker's healthcheck, and `restart: unless-stopped` brings any
crashed service back after a failure or reboot.

## Troubleshooting

| Symptom | Check |
|---|---|
| Site unreachable | `docker compose -f docker-compose.prod.yml ps`; DNS A record; firewall 80/443 |
| Certificate errors | `logs caddy` — ACME needs the A record resolving to THIS server, ports 80+443 reachable |
| Sign-in loops / cookie issues | APP_URL scheme is https and matches the domain; COOKIE_SECURE set |
| Emails not arriving | `logs app` for `[email]` lines; verify SMTP_* values; invitations still work by copy-link |
| Uploads failing | `logs app`; `docker volume inspect` the storage volume; 25 MB app cap / 30 MB proxy cap |
| Worker silent | `logs worker` — must show `[worker] started; waiting for jobs` |
