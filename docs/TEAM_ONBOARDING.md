# Team Onboarding

How to bring your coworkers into the live system, in the order that works.

## Before anyone is invited

1. The system is deployed at its real HTTPS address (docs/DEPLOYMENT.md)
   and you can sign in as the administrator you created at first-run
   setup.
2. Optional but recommended: SMTP is configured in `.env`, so invitations
   arrive by email. Without it, every invitation still works — you copy
   the link and send it by text.
3. Do not run the demo seed on the production database. It wipes
   everything (and refuses to run in production for exactly that reason).

## Inviting people (Admin → Users → Invite user)

For each coworker:

1. Enter their **email**, **display name**, and **role**:
   - **Administrator** — settings, users, imports, audit. Just you, plus
     at most one backup person.
   - **Manager** — sites, assets, work orders, scheduling, approvals,
     reports.
   - **Technician** — assigned work, photos, parts, time, readings, from
     a phone.
   - **Requester** — can report problems and track them; nothing else.
2. Pick a **team** if they're on one (technicians usually are).
3. Leave username blank to let them choose their own.
4. Send. If email is configured they get the link; either way you get a
   one-time copy of the link to forward manually.
5. They open the link on their phone, pick a password, and land signed
   in. Their first stop should be **Add to Home Screen**
   (docs/MOBILE_WORKFLOW.md §2).

Housekeeping: the Users screen shows every invitation with its state
(pending / accepted / expired / revoked). **Resend** issues a fresh link
and kills the old one; **Revoke** kills it outright. Both are audited.

## Order of onboarding (don't invite everyone at once)

1. **You** (administrator) — set org name, timezone, and whether completed
   work needs manager approval (Admin → Settings).
2. **One manager.** Together, create the first real site, a location or
   two, and 2–3 real assets (docs/ASSET_ONBOARDING_GUIDE.md).
3. **One technician.** Run one real work order end-to-end from their
   phone: assign → start → photos → parts → time → reading → complete.
   Fix anything confusing *now*, while the audience is two people.
4. **The rest of the team**, once that first real work order looks right.

## Accounts you manage by hand

"Add manually" still exists for people without email. The password you
type is temporary by design — their first login forces them to choose
their own. Deactivate (never delete) people who leave; their history
stays.

## If someone is locked out

- They can use **Forgot your password?** on the sign-in page (needs an
  email on the account).
- Or you reset it from Admin → Users → their account — the new password
  you set is again change-on-first-login.
