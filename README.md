# Maintenance Manager (internal CMMS)

Internal web application for asset tracking, work orders with pictures and
procedures, work requests, preventive maintenance, meters, scheduling, bulk
imports, and reporting. Functional reference: commercial CMMS products such as
MaintainX; this is an original in-house implementation.

Works on desktop and mobile browsers — field technicians use it from their
phones.

## Stack

- Next.js (App Router) + React + TypeScript — web UI and server logic
- PostgreSQL 16 + Drizzle ORM (SQL migrations in `drizzle/`)
- pg-boss — background jobs (PM generation, meter triggers, imports) run by a
  separate worker process (`npm run worker`)
- Local-disk file storage behind an adapter (`STORAGE_DIR`)
- Vitest (unit/integration) + Playwright (end-to-end)

## Local development

Prereqs: Node 22.9+, PostgreSQL 16 (or use docker compose for the DB only).

```bash
cp .env.example .env          # then edit DATABASE_URL
npm install
npm run db:migrate            # apply SQL migrations
npm run db:seed               # demo data + dev logins (see docs/ADMIN_GUIDE.md)
npm run dev                   # web app on :3000
npm run worker                # background jobs (separate terminal)
```

Checks:

```bash
npm run typecheck
npm run lint
npm test                      # vitest
npm run test:e2e              # playwright (starts its own server on :3100)
```

## Production (docker compose)

```bash
cp .env.example .env          # set POSTGRES_PASSWORD at minimum
docker compose up -d --build
```

This starts Postgres, the web app (migrations apply automatically on boot),
and the background worker. Uploaded files persist in the `storage_data`
volume; the database in `db_data`.

## Documentation

| File | Purpose |
|---|---|
| `docs/TEST_RUN.md` | **Try it out** — step-by-step test drive on a Windows PC |
| `docs/PROJECT_STATE.md` | Live build status — read this first |
| `docs/FEATURE_MATRIX.md` | Feature-by-feature status with test evidence |
| `docs/IMPLEMENTATION_PLAN.md` | Phased plan being executed |
| `docs/CURRENT_STATE_AUDIT.md` | Audit of the repository before work began |
| `docs/GAP_ANALYSIS.md` | Spec requirements vs. current state |
| `docs/DECISIONS.md` | Architecture decisions and tradeoffs |
| `docs/TEST_LOG.md` | Every test cycle with commands and results |
| `docs/DEPLOYMENT.md` | Production deployment guide |
| `docs/BACKUP_AND_RESTORE.md` | Backup/restore procedures |
| `docs/ADMIN_GUIDE.md` | Administrator manual + dev logins |
| `docs/USER_GUIDE.md` | Technician/requester manual |

## Scope notes

Parts/inventory, purchase orders, and vendors are deliberately **not**
implemented yet. The data model leaves documented extension points so a parts
module can be added without rewriting work orders or assets (see
`docs/DECISIONS.md`).
