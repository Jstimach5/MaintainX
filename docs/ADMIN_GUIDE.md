# Administrator Guide

## Development / demo logins

`npm run db:seed` loads demo data with these accounts (never use in
production — the seed also WIPES all data):

| Username | Password | Role |
|---|---|---|
| admin | admin-demo-123 | Administrator |
| morgan | morgan-demo-123 | Manager |
| marta | marta-demo-123 | Manager |
| taylor | taylor-demo-123 | Technician |
| terry | terry-demo-123 | Technician |
| tessa | tessa-demo-123 | Technician |
| riley | riley-demo-123 | Requester |

## What each role can do (§4)

- **Administrator** — everything: users/teams, sites/locations, assets,
  imports, procedures, PM plans, meters, reports, audit log, archiving.
- **Manager** — review/approve/convert requests, create/assign/edit work
  orders, procedures, PM plans, meters + triggers, schedule view, reports.
- **Technician** — see and work assigned jobs (their own, their team's, or
  unassigned work), complete procedure steps, upload pictures, log time,
  enter meter readings, update asset status, submit follow-up requests.
- **Requester** — submit requests with pictures and track their status.
  They never see internal notes or other people's requests.

## Day-to-day administration

- **Users** (`/admin/users`): create accounts, set roles, reset passwords
  (resets sign the user out everywhere), deactivate on departure
  (deactivation revokes their sessions immediately). Users are never
  deleted — history keeps its names.
- **Teams** (`/admin/teams`): group technicians for assignment/routing.
- **Sites** (`/sites`): each site holds a nested location tree. Archiving a
  site or location hides it from pickers; history is preserved. The site
  page also manages the **public request portal** — enabling it mints a
  link anyone can use to submit requests (rate-limited, no account).
- **Assets** (`/assets`): archive instead of delete; use Transfer (not
  edit) to move assets so location history is kept; print QR labels from
  the asset page.
- **Procedures** (`/procedures`): editing creates a new version — work
  orders keep the version they were given.
- **PM plans** (`/pm-plans`): floating schedules re-anchor from completion;
  fixed schedules keep the original calendar. "Run scheduler now" forces a
  generation pass (the worker also runs hourly).
- **Meters** (`/meters`): triggers generate work orders at thresholds or
  usage intervals — exactly once per crossing.
- **Imports** (`/imports`): upload → map columns → validate (dry run) →
  import → optional rollback. Rejected rows never import; download the
  issues CSV to fix and retry. A sample file is at `docs/sample-import.csv`.
- **Audit log** (`/admin/audit`): append-only record of every important
  action; filter by record type, action, user, or date.

## Housekeeping

- Backups: `scripts/backup.sh` — see docs/BACKUP_AND_RESTORE.md.
- The worker process must stay running for PM generation.
- Reports (`/reports`) can be filtered by date/site and exported to CSV.
