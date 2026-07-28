# Mobile Field Workflow — Methodology

How maintenance coworkers use the system from their phones, and how the
work they enter lands on the office computer. Written to be handed to a
technician on day one.

## 1. How the pieces fit together

- **The office server is the single source of truth.** The app runs on the
  computer server in the office; the database and every photo live there.
- **Phones are entry devices.** Technicians open the same web app in their
  phone browser (no app store, nothing to install) and everything they
  type, photograph, or record saves to the server the moment they hit a
  button.
- **The office computer is the monitoring station.** There is no "push" or
  "sync" step — the moment a technician saves something in the field, it is
  already on the office screens (refresh the page to see the latest).

```
 phone (technician) ──┐
 phone (technician) ──┼── office server ── office computer (manager view:
 laptop (manager)   ──┘   (database +       dashboard · schedule · reports)
                           photos)
```

Phones must be on the same network as the server (office Wi-Fi, or VPN if
IT has set one up). No connection = no entry; the app does not queue
offline changes — finish the entry when back in Wi-Fi range.

## 2. One-time phone setup (per coworker, ~2 minutes)

1. Connect the phone to the office Wi-Fi.
2. Open the browser (Safari on iPhone, Chrome on Android) and go to the
   server address, e.g. `http://<server-ip>:3000` — the admin will give you
   the exact address.
3. Log in with the username and password the admin created for you
   (Admin → Users; each coworker gets their own login — never share one,
   because every entry is stamped with who made it).
4. **Add it to the home screen** so it opens like an app:
   - iPhone: Share button → *Add to Home Screen*.
   - Android: ⋮ menu → *Add to Home screen*.
5. Tap the new icon once to confirm it opens straight to the dashboard.

## 3. Daily methodology for maintenance coworkers (technicians)

### Morning — check the plan (1 minute)

- Open the app → **Schedule**. This is *your* calendar: only work assigned
  to you, laid out by day. Switch between calendar and table with the tabs.
- **Dashboard** shows the same work as a list with overdue items called out.

### Per job — the documentation loop

Open the work order (from Schedule, Dashboard, or by scanning the QR label
on the machine) and work top to bottom:

1. **Read the details** — description, priority, due date, linked assets,
   and any attached procedure.
2. **Tap "Start work"** when you begin. This stamps the start time, and if
   the job plans downtime it automatically marks the asset down.
3. **Photograph as you go** — Attachments → *Add files* opens the phone
   camera. Use the category dropdown: *before* / *during* / *after* /
   *damage*. Pictures land on the server immediately.
4. **Follow the procedure steps** if one is attached — checkboxes,
   pass/fail, measurements. A failed step will ask for a comment and can
   flag follow-up work automatically.
5. **Document parts and cost** — in *Parts & materials used*, type the part
   name (part number if you have it), quantity, and cost each. The work
   order totals the cost. No price on hand? Leave cost blank — the line
   still shows the part was used. Wrong entry? Tap ✕ to remove your line.
6. **Log your time** — *Log labor time*: hours/minutes and what you did.
7. **Record meter readings** — the *Meter readings* panel lists every
   meter on the machine you're working on (hours, miles, fuel, …). Type
   the current reading while you're standing at it. Readings feed the
   maintenance schedules and usage-based triggers, so this is not optional
   busywork — enter it every visit.
8. **Tap "Mark completed"** — write completion notes (what was found, what
   was done) and the actual downtime if the machine was down. If required
   procedure steps are unanswered, the app will refuse and tell you which
   ones.

### Anytime — found a new problem?

Don't leave it in your head: open **Requests → New request** (or scan the
asset's QR code), describe it, attach a photo. A manager reviews it and
turns it into a work order.

## 4. What the office computer shows (managers)

Live views over everything the field enters — refresh to see the latest:

- **/dashboard** — open/overdue counts and KPIs.
- **/schedule** — the whole operation: table with filters, month calendar,
  and a 14-day timeline with downtime highlighted, plus the "Needs
  attention" warnings panel (overdue PM, unassigned work, conflicts).
- **A work order's page** — the full field record: photos, procedure
  answers, parts and cost totals, labor time, readings, status history.
- **/reports** — completion rates, downtime, costs; export any view to CSV
  for Excel; print-friendly output.
- **/admin/audit** — the append-only trail of who did what, when.

Division of labor in practice: **additions happen on phones in the field;
review, scheduling, approvals, and reporting happen at the office
computer.** Both sides look at the same live data.

## 5. Rules of thumb

- One login per person — the history is only as good as the name on it.
- Photos: up to 25 MB each; ordinary phone photos are fine.
- Meter readings that only count up (hours, miles) will refuse a lower
  number — tick *rolled over* only when the meter genuinely restarted.
  Fat-fingered a reading? A manager can correct it on the meter's page
  (the original stays in history, voided).
- Finish documenting **before** leaving the machine — parts, time, and
  readings entered from memory at the end of the day are the entries that
  turn out wrong.
- Canceled work is not completed work — cancel only work that will never
  be done, and let a manager do it.

## 6. If it doesn't work

| Symptom | Likely cause / fix |
|---|---|
| Page won't load in the field | Phone dropped off office Wi-Fi — reconnect and reload. |
| "This work order is assigned to someone else" | You're not on the job's assignee list — ask a manager to add you. |
| Photo upload fails | File over 25 MB or an unsupported type — retake as a normal photo. |
| Reading rejected as "only counts up" | Lower than the last reading — check the number, or tick rollover if the meter restarted. |
| Can't see the Schedule/paperwork pages | Your role doesn't include them (requesters see only requests) — the admin sets roles under Admin → Users. |

Full feature walkthroughs: docs/USER_GUIDE.md. Admin tasks (creating
logins, roles, backups): docs/ADMIN_GUIDE.md.
