# Deployment

## What you're deploying

Three processes, one database, one file directory:

| Piece | Role |
|---|---|
| `next start` (app) | The web application |
| `npm run worker` | Background jobs: PM generation, session cleanup |
| PostgreSQL 16 | All records |
| `STORAGE_DIR` | Uploaded pictures/files (plain directory) |

## Option A — docker compose (recommended)

```bash
cp .env.example .env        # set POSTGRES_PASSWORD to something real
docker compose up -d --build
```

That starts Postgres (volume `db_data`), the app on port 3000 (migrations
apply automatically at boot), and the worker. Uploads persist in the
`storage_data` volume.

Updating: `git pull && docker compose up -d --build` (migrations re-apply).

## Option B — bare Node on a server

Prereqs: Node 22.9+, PostgreSQL 16, a database + role.

```bash
cp .env.example .env        # set DATABASE_URL, STORAGE_DIR, PORT
npm ci
npm run db:migrate
npm run build
npm run start               # web app  (systemd/pm2 recommended)
npm run worker              # background jobs (second service)
```

Example systemd units should set `Restart=always`, `WorkingDirectory` to
the app folder, and `EnvironmentFile=.env`.

## First run

Visit the app → you land on `/setup` → create the organization (pick the
correct **timezone** — all due dates use it) and the first administrator.
**Do this immediately**: until an admin exists, anyone who can reach the
server can claim the account. Then add users under Users, sites under
Sites, and go.

## Security posture (§16)

- Backend role checks on every page, action, and API route; sessions are
  DB-backed (revocable) with 30-day expiry; scrypt password hashing.
- Uploads are allowlisted (images/PDF/office docs — never executables),
  stored under server-generated names, and served auth-gated with
  `X-Content-Type-Options: nosniff`.
- The public request portal is tokenized per site, rate-limited
  (5/hour/IP), and exposes only that site's location/asset names.
- Run behind HTTPS in production: put a reverse proxy (Caddy, nginx,
  Traefik) in front of port 3000 and set `COOKIE_SECURE=1` so session
  cookies are marked Secure.
- Never commit `.env`. Backups: docs/BACKUP_AND_RESTORE.md.

## Health checks

- App: `GET /login` returns 200.
- Worker: logs `[worker] started; waiting for jobs` on boot and pm-tick
  lines hourly.
- DB: `pg_isready`.

## Troubleshooting

| Symptom | Check |
|---|---|
| 500s on every page | `DATABASE_URL` reachable? migrations applied? |
| Pictures broken | `STORAGE_DIR` exists and is writable by the app user |
| PM work orders not appearing | Is the **worker** process running? |
| Port in use | Change `PORT` in `.env` |
