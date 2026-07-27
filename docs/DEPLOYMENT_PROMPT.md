# Deployment prompt

Copy everything between the lines below and paste it into a fresh Claude
Code session **opened in this repository, on the machine that will run the
app** (or on your laptop if you want help picking that machine first).

---

I want to deploy the internal maintenance and asset management app in this
repository so my team can use it from their phones and laptops on our
network. **I am not a developer.** I can copy and paste commands, plug in
hardware, and log into my router, but I cannot debug anything myself.

Your job is to get this actually running for real — not to explain how I
could do it — and to leave me with a written runbook I can use later
without you.

## Ground rules

- Ask me questions before making any decision that depends on my situation.
  Ask in small batches, not twenty questions at once.
- Before running anything, tell me in plain language what it does and why.
  No unexplained jargon.
- Do one step at a time and verify it worked before moving to the next one.
  Show me the actual evidence — command output, a page loading, a log line.
- Never put passwords, connection strings, or the `.env` file into git.
- Do not load demo/seed data into the real system. The demo logins in
  `docs/ADMIN_GUIDE.md` are for testing only and must never exist in
  production.
- If something fails, tell me exactly what failed and what you're doing
  about it. Never tell me something "should work" — check it.

## Phase 0 — Read what's already written

Read `docs/DEPLOYMENT.md`, `docs/BACKUP_AND_RESTORE.md`,
`docs/ADMIN_GUIDE.md`, and `docker-compose.yml` before you start. They
describe the intended deployment. Follow them; if you find something in
them that's wrong or missing, fix the doc as part of this work.

## Phase 1 — Work out where this is going

Ask me:

1. What machine will run this — a spare PC, a mini PC, a server we already
   have, a NAS, or a cloud VM? What operating system is on it?
2. Should it be reachable only inside our building, or from outside too
   (people working from home or in the field)?
3. Roughly how many people will use it, and what timezone are we in? (The
   timezone matters a lot — every due date and schedule uses it.)
4. Do we already have a way to give a machine a permanent address, or a
   name like `maintenance.ourcompany.local`?

Then tell me plainly which deployment option you recommend — Docker
compose (`docs/DEPLOYMENT.md` Option A) or plain Node + PostgreSQL
(Option B) — and why, based on my answers. Default to Docker unless
there's a specific reason not to.

## Phase 2 — Prepare the machine

Walk me through each of these, confirming each one worked before moving on:

- Install what's needed (Docker and the compose plugin, **or** Node 22.9+
  and PostgreSQL 16).
- Get the code onto that machine.
- Give the machine a **fixed address** on our network, so the address I
  hand out to people doesn't change when it reboots. Tell me exactly what
  to click in my router, or how to set a static IP on the machine itself —
  whichever you recommend.
- Open the app's port in the machine's firewall so phones can reach it.

## Phase 3 — Configure it

- Create `.env` from `.env.example`.
- **Generate a strong database password for me** — don't ask me to invent
  one. Same for any other secret.
- Set `STORAGE_DIR`, `PORT`, and `COOKIE_SECURE` correctly for my setup.
- Confirm `.env` is git-ignored and will not be committed.
- Show me the finished `.env` with secrets masked, and tell me clearly
  where the real password is stored and that I should save it in our
  password manager.

## Phase 4 — Start it

- Bring it up (Docker: `docker compose up -d --build`).
- Confirm **all three pieces** are healthy: the database, the web app, and
  the background worker. The worker must log
  `[worker] started; waiting for jobs` — if it isn't running, recurring
  preventive maintenance work orders will silently never be created, which
  is the failure I'd be least likely to notice on my own.
- Confirm the app answers on the machine's real network address, not just
  `localhost`.

## Phase 5 — First-run setup, immediately

The first visit lands on a setup page that lets whoever gets there first
create the administrator account. Until I've done that, anyone who can
reach the server can take over the system. So do this straight away:

- Walk me through creating the organization with the **correct timezone**
  and my administrator account.
- Have me confirm the setup page no longer offers to create an admin.

## Phase 6 — Prove it works from a phone

Do not declare success from the server console. Have me actually do this on
my phone, and tell me what to look for at each step:

1. Open the address in my phone browser and log in.
2. Create a site, a location inside it, and one asset.
3. Create a work order, take a photo with the phone camera, attach it, and
   complete the work order.
4. Reload the page and confirm the photo is still there.
5. Restart the app and confirm the photo is *still* still there.

Fix anything that doesn't work before continuing.

## Phase 7 — Make it survive real life

- Reboot the machine — actually reboot it — and confirm everything comes
  back by itself with no help from me.
- Set up `scripts/backup.sh` to run automatically every day, per
  `docs/BACKUP_AND_RESTORE.md`. Tell me where backups are written and how
  much disk space they'll use over time.
- Run a backup now, then **do a test restore into a scratch database** to
  prove the backup actually works. Do not skip this and do not assume it
  works because the script exited cleanly.
- Tell me how to check, a month from now, that backups are still running.

## Phase 8 — Hand it over

Write `docs/RUNBOOK.md` with **my real details filled in**, covering:

- The address people use, and the machine's address for admin work.
- How to start, stop, and restart it.
- How to tell whether it's healthy.
- How to update it when the code changes.
- Where backups are and the exact steps to restore one.
- The three most likely problems and what to do about each.
- How to add my first users and sites.

Then give me a short plain-language summary: what is running where, what I
still need to do myself, and anything you could not finish and why.

## Things I want you to raise with me, not decide silently

- **HTTPS.** Explain the trade-off for an internal deployment (a reverse
  proxy like Caddy, a real certificate versus a local one, and what that
  means for phones) and recommend one. Don't just leave it on plain http
  without telling me what that costs.
- **The public request portal.** It lets people submit maintenance requests
  without an account. Don't enable or publish it until we've talked about
  who should be able to reach it.
- **Email.** Notifications are in-app only by default. Don't wire up SMTP
  unless I ask for it.
- **Anything that would cost money** — cloud hosting, domains,
  certificates. Tell me before, not after.

---
