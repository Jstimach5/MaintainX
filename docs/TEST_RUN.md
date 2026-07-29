# Test Run on a Windows PC — Step by Step

This gets the maintenance system running on one Windows computer so you and
a couple of coworkers can try it for real — from the PC and from phones on
the office Wi-Fi. Everything here is throwaway: demo data, a test
password, no backups. When the trial convinces you, do the real deployment
with `docs/DEPLOYMENT_PROMPT.md` instead (it walks Claude Code through a
proper install).

Time: about 30–45 minutes, most of it a one-time download.

## What you need

- A Windows 10 or 11 PC (64-bit) where you can install software.
- The PC and the test phones on the same office Wi-Fi / network.
- One or two phones with a camera.

## Step 1 — Install Docker Desktop (one time, ~15 min)

Docker runs the whole system (database, web app, background worker) in
self-contained boxes so nothing else has to be installed or configured.

1. Download **Docker Desktop for Windows** from
   <https://www.docker.com/products/docker-desktop/> and run the
   installer. Accept the default **WSL 2** option if asked.
2. Reboot if the installer asks.
3. Start **Docker Desktop** from the Start menu and wait until the whale
   icon in the system tray stops animating (it will say "Engine running").
   You don't need an account — skip any sign-in screens.

**If Docker Desktop shows "WSL not installed":** the PC is missing a
small Windows component Docker relies on. Fix it once:

1. Click **Quit** on the error.
2. Open PowerShell **as administrator** (Start → type `powershell` →
   right-click **Windows PowerShell** → **Run as administrator**) and run:

   ```powershell
   wsl --install
   ```

   If a window later asks you to create a "UNIX username", just close
   it — Docker doesn't need it.
3. **Restart the computer** (required), then start Docker Desktop again
   and wait for "Engine running".

If `wsl --install` itself fails with a message about **virtualization**,
it needs a one-time setting enabled in the PC's BIOS — ask Claude Code
with the exact error message and the PC model.

## Step 2 — Get the code onto the PC

Easiest: download it as a ZIP in your browser.

1. Open
   <https://github.com/Jstimach5/MaintainX/tree/claude/asset-tracking-software-lltwy3>
   — note that this is the **`claude/asset-tracking-software-lltwy3`
   branch**; the code lives there.
2. Click the green **Code** button → **Download ZIP**.
3. Right-click the downloaded ZIP → **Extract All…** → extract to
   somewhere simple, e.g. `C:\cmms-test`.

(If you have git installed, the equivalent is
`git clone -b claude/asset-tracking-software-lltwy3 https://github.com/Jstimach5/MaintainX.git C:\cmms-test`.)

## Step 3 — One tiny configuration file

1. Open **PowerShell** (Start menu → type "powershell") and go to the
   folder — adjust the path if your extract created a nested folder; the
   right folder is the one containing `docker-compose.yml`. **If any part
   of your path contains spaces, the quotes are required** — without them
   PowerShell splits the path at each space and errors with "positional
   parameter cannot be found":

   ```powershell
   cd "C:\Users\you\Documents\My Folder\MaintainX-claude-asset-tracking-software-lltwy3"
   dir docker-compose.yml
   ```

2. Create the settings file from the template and open it in Notepad:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

3. In Notepad, add this line at the bottom (a throwaway password for the
   test database), then save and close:

   ```
   POSTGRES_PASSWORD=test-run-only-password
   ```

## Step 4 — Start it

In the same PowerShell window:

```powershell
docker compose up -d --build
```

The **first** run downloads and builds everything — expect 5–10 minutes.
When it finishes, check that all three parts are up:

```powershell
docker compose ps
```

You should see three lines — `db`, `app`, and `worker` — all "running"
(db shows "healthy"). Then open <http://localhost:3000> in the PC's
browser. A login page means it's alive.

## Step 5 — Load the demo data

This fills the system with a demo company — two sites, machines, work
orders in every state, a maintenance plan, a meter, and one login per
role — so there's something to explore:

```powershell
docker compose exec app npm run db:seed
```

Wait for `Seed complete.` **Demo logins** (password is always the
username + `-demo-123`):

| Username | Who they are | Password |
|---|---|---|
| `admin` | Alice Admin — administrator | `admin-demo-123` |
| `morgan` | Morgan Manager — manager | `morgan-demo-123` |
| `marta` | Marta Manager — manager | `marta-demo-123` |
| `taylor` | Taylor Tech — technician | `taylor-demo-123` |
| `terry` | Terry Tech — technician | `terry-demo-123` |
| `tessa` | Tessa Tech — technician | `tessa-demo-123` |
| `riley` | Riley Requester — requester | `riley-demo-123` |

## Step 6 — Reach it from phones

1. Find the PC's address. In PowerShell:

   ```powershell
   ipconfig
   ```

   Under your active adapter (usually "Wireless LAN adapter Wi-Fi" or
   "Ethernet adapter"), read the **IPv4 Address** — something like
   `192.168.1.42`.

2. Allow phones through the Windows firewall (PowerShell **run as
   Administrator** — right-click PowerShell → Run as administrator):

   ```powershell
   netsh advfirewall firewall add rule name="CMMS test run" dir=in action=allow protocol=TCP localport=3000
   ```

3. On each phone's browser, open `http://<that address>:3000`, e.g.
   `http://192.168.1.42:3000`, and log in. Use the browser's **Add to
   Home Screen** so it opens like an app.

If the phone can't load the page: it's almost always one of — phone not on
the office Wi-Fi, the firewall rule missing, or a guest Wi-Fi network that
isolates devices from each other (try the non-guest network).

## Step 7 — A 30-minute test script

Play the roles with your coworkers — this touches everything that matters:

**As `morgan` (manager, on the PC):**
1. Work orders → New — "Test the new system", site Main Plant, pick the
   Air Compressor, assign Taylor Tech, planned start today, due today.
2. Look at **Schedule** — table, calendar, and timeline views.

**As `taylor` (technician, on a phone):**
3. The home screen shows the job under "Due today". Open it.
4. Tap **Start work**, then **Start timer**.
5. Take a photo with the camera (Attachments → Add files, category
   *before*).
6. Add a part: "Oil filter", qty 1, cost 12.50 — watch the total.
7. Record a meter reading on the compressor (it has an hours meter).
8. Pause the job ("Interrupt this job" → Paused, with a reason) — then
   resume and **Stop & log time**.
9. **Mark completed** with a note.

**As `admin` (on the PC):**
10. Admin → Settings → turn **completion approval** on and save.

**As `taylor` then `morgan`:**
11. Taylor completes another job (there are seeded open ones on the
    dashboard) — it now shows **Waiting for approval** instead of
    Completed. Morgan opens it, reads the write-up, and approves (or
    sends it back with a note).

**As `riley` (requester, on a phone):**
12. Submit a request with a photo ("Leaking pipe in Building A"). As
    Morgan, review it, approve, convert to a work order.

**Back as `morgan`:**
13. Open **Reports** — completion stats, downtime, costs; export a CSV.
14. Open **Admin → Audit** (as `admin`) — every action above is in the
    trail, with names and times.

## Resetting and stopping

- **Fresh demo data** (wipes every change made during the trial):

  ```powershell
  docker compose exec app npm run db:seed
  ```

- **Stop the system** (keeps the data for next time):

  ```powershell
  docker compose down
  ```

  Start it again later with `docker compose up -d`.

- **Erase the whole trial** (data, photos, everything):

  ```powershell
  docker compose down -v
  ```

## When you're ready to deploy for real

The real thing differs from this trial in exactly the ways you'd expect: a
strong secret password, your real company name and timezone (no demo
data — the first visit sets up your own admin account), a permanent
address for the server, automatic backups, and a decision about HTTPS.
Open a Claude Code session on the machine that will host it and paste in
`docs/DEPLOYMENT_PROMPT.md` — it walks through all of that interactively
and leaves you a runbook.

---

*Honesty note: the Docker steps mirror `docs/DEPLOYMENT.md` and were
verified by inspection of the compose/Docker files; the build sandbox this
system was developed in cannot run Docker itself, so this exact Windows
sequence hasn't been executed end-to-end there. If any step errors, paste
the exact message into Claude Code — with this repo open it has everything
it needs to fix it.*
