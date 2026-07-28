# Mobile Field Audit

Date: 2026-07-28 · Branch: `claude/asset-tracking-software-lltwy3`
Audited build: Phase 14 (143 unit tests, 61-test Playwright suite)

This is an audit of the **existing** application against the mobile field
specification — what already works on a phone, what is awkward, what is
missing, and what should stay on the office computer. Nothing here is
aspirational: every "works" claim traces to a recorded run in
docs/TEST_LOG.md or a spec in `e2e/`.

## 1. What the application is today

| Layer | Implementation |
|---|---|
| Frontend | Next.js 16 App Router, React 19, server components + server actions, Tailwind 4. Responsive, no separate mobile build. |
| Backend | Same Next.js process: server actions + route handlers under `src/app/api/*`, domain logic in `src/server/services/*`. |
| Database | PostgreSQL 16 via Drizzle ORM; plain-SQL migrations `drizzle/0000–0011`. |
| Auth | scrypt password hashing, DB-backed sessions (sha256 token at rest, 30-day expiry, revoked on deactivation), HttpOnly cookie, `requireRole`/`assertRole` guards on every route and action. |
| Files | Local-disk storage adapter, sharded keys, 25 MB cap, MIME allowlist, served auth-gated through `/files/[id]` with a serve-time re-check and `nosniff`. |
| Background | pg-boss worker process (`src/worker`) for PM generation + housekeeping. |
| Roles | admin, manager, technician, requester — enforced server-side. |

There is **no** native mobile app and no separate mobile codebase. The
office UI and any phone use the same routes, same session, same database.

## 2. What already works on a phone (verified)

Verified by the `@mobile` Playwright project (Pixel 7 viewport) plus the
desktop specs that exercise the same server paths:

- Login/logout; session survives app restart.
- Dashboard with "assigned to me" work.
- Work-order detail: start / hold / complete, comments, completion notes,
  actual downtime.
- **Camera uploads** — `<input type="file" accept="image/*">` opens the
  phone camera; categories before / during / after / inspection / damage;
  files persist across app restart (tested).
- Procedures: all current step types render and save one step at a time;
  required steps block completion with a named list of blockers; failed
  pass/fail requires a comment, flags the WO, and can create a corrective
  request or work order exactly once.
- Meter readings, with monotonic/rollover/absurd-value validation and
  audited corrections; readings can now (Phase 14) be entered from the
  work-order page for any meter on the job's assets.
- Parts & materials with quantity and unit cost, totalled per work order
  (Phase 14) — documentation only, no inventory.
- Labor time entry (hours + minutes + note + date).
- Work requests: authenticated form and the anonymous per-site portal
  (rate-limited); QR label scan (`/a/[token]`) → asset page for staff, or
  a portal request form with the asset preselected for anyone else.
- Technician calendar on `/schedule`, scoped server-side to own work
  (Phase 14).
- In-app notifications with an unread badge.
- No horizontal page scroll at Pixel 7 width on the flows tested; inputs
  are 16px+ so iOS does not zoom on focus; touch targets are ≥44px on the
  primary actions.

## 3. What is difficult to use on a phone today

- **Navigation is a desktop header** — a single horizontal row of up to 14
  links that wraps/scrolls on a phone. No bottom navigation, no
  field-first grouping.
- **The dashboard is a manager-shaped summary**, not a field home screen:
  no "today", no "overdue", no PM-due tile, no large New Request / Scan
  buttons.
- **Work-order actions live at the top and middle of a long page.** A
  technician must scroll back up to change status after documenting work.
- **The work-order list has no field filters** (today, due this week,
  available/unassigned, my team) and no sort control.
- Procedures render as one long list — no sectioning, no progress
  indicator on long checklists.
- Signature steps accept a **typed name only**; there is no drawn
  signature.
- Photos upload at full camera resolution (no client compression) and
  lists render full-size images rather than thumbnails.
- No in-app QR scanner: scanning requires the phone's own camera app to
  open the printed label URL.

## 4. What is missing for field use

Statuses `paused` and `waiting_approval`; pause/hold **reasons**; manager
return-to-technician and optional completion approval; a **labor timer**
(only manual entry exists); per-step photo attachments and enforcement of
`failure.requirePhoto`; warning (non-failing) numeric ranges; required
picture **categories** as a completion gate; `yes_no` / `safety_confirm`
step types; in-app QR scanning; drawn signatures; **PWA install**;
**offline capture and synchronization** of any kind; conflict detection;
push notifications; image compression and thumbnails; saved mobile
filters; automated testing at iPhone, small-Android, and tablet widths.

## 5. What is broken

Nothing known. The full suite is green at the audited build (143 unit,
61 e2e). No unexplained console or server errors were observed in the
Phase 13 sweep.

## 6. What requires a desktop today (and what should stay there)

**Genuinely awkward on a phone, and appropriate to keep on the office
computer:** bulk CSV/XLSX imports, user and team administration,
procedure/PM/meter builders, the audit browser, reporting dashboards and
CSV export, backup/restore. These are manager and administrator tasks
done sitting down; the spec explicitly permits them to remain
desktop-only.

**Should become fully mobile:** everything a technician or requester does
during a shift — the full list in §4 above.

Managers keep both: approvals, assignment, and review need to work on a
phone; report configuration does not.

## 7. Risks

### Remote access
The application currently assumes a trusted LAN. Exposing it to phones
outside the building introduces real risk:
- **Never** forward a raw application port from the router. Any external
  path must terminate HTTPS at a reverse proxy or ride a VPN/tunnel.
- The database must never be internet-reachable; only the app process
  talks to it, over a private connection.
- Session cookies are only marked `Secure` when `COOKIE_SECURE=1`, which
  requires HTTPS — plain-http exposure would ship session tokens in the
  clear.
- Login throttling and the portal rate limit are **in-memory**, so they
  protect a single-process deployment but reset on restart.
- The public request portal is anonymous by design; its token is the only
  thing standing between the internet and a submission form.

### Uploads and synchronization
- Photos taken on modern phones are several MB; on a weak connection an
  upload can take minutes, and today there is no progress indicator, no
  retry, and no local copy — a failed upload loses the photo.
- Without idempotency keys, a retried submission could duplicate a work
  order, a reading, or a labor entry. The existing PM/meter/import paths
  are idempotent by DB constraint; the field paths are not yet.
- HEIC photos upload but may not preview in every browser.

### Poor connectivity
- Nothing works offline today. A dropped connection mid-form loses the
  entry, and a technician in a basement or a remote yard simply cannot
  document work.
- There is no pending/synced indicator, so a technician cannot tell
  whether their work reached the server.
- Any offline design must not silently overwrite newer server state when
  a queued change lands late.

## 8. Conclusion

The backend, data model, permissions, and audit trail are sound and need
no rework for mobile — the field gap is a **presentation and
synchronization** gap, plus a handful of missing field-specific behaviors
(timer, statuses, signatures, required-picture gates). The plan in
docs/MOBILE_IMPLEMENTATION_PLAN.md builds those on the existing backend
rather than beside it.
