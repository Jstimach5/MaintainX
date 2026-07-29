# Mobile Feature Matrix

Statuses: Working · Partially working · Broken · Missing · Deferred · Blocked · Verified

**Verified requires recorded test evidence in MOBILE_TEST_LOG.md — code
existing is not verification.**

Last updated: 2026-07-29 (M1+M2 landed; settings screen; 88/88 suite)

## P0 — Required for field use

| Feature | Status | Relevant files | Required work | Acceptance test | Evidence |
|---|---|---|---|---|---|
| Mobile login | Verified | src/app/(auth)/login | — | Sign in at phone width; session survives restart | TEST_LOG Phases 1, 11 |
| Mobile home screen (today/overdue/PM-due/in-progress tiles, New Request + Scan buttons) | Verified | dashboard/field-home.tsx, services/field.ts | — | Tiles show correct counts; both buttons reachable without scrolling | 5 unit tests (M1) + MOBILE_TEST_LOG M1/M2 close-out (88/88) |
| Bottom navigation (≤5 areas) | Verified | components/field-nav.tsx, (app)/layout.tsx | — | Present at phone widths, absent on desktop | MOBILE_TEST_LOG M1/M2 close-out (88/88) |
| Account screen | Verified | (app)/account | — | Identity, role, org timezone, sign-out | MOBILE_TEST_LOG M1/M2 close-out (88/88) |
| Assigned work-order list | Partially working | src/app/(app)/work-orders | Field filters (today, this week, available, my team) + sort + requirement badges | Each filter returns the right set; sort applies | TEST_LOG Phase 4 |
| Mobile work-order screen | Verified | work-orders/[id], wo-forms FieldActionBar | — | Actions reachable without scrolling to top | MOBILE_TEST_LOG M1/M2 close-out (88/88) |
| Start / pause / hold / resume / complete | Verified | workOrders.ts changeWorkOrderStatus | — | Every transition recorded with user, time, and a required reason | 6 unit tests (M2) + MOBILE_TEST_LOG M1/M2 close-out (88/88) |
| Completion approval (optional, org setting) | Verified | org_settings.require_completion_approval, /admin/settings | — | Tech completion parks in `waiting_approval`; only a manager clears it; toggle managed on the admin settings screen (audited) | 6 unit tests + MOBILE_TEST_LOG M1/M2 close-out (88/88) |
| Labor timer (start/pause/resume/stop) | Verified | work_order_timers, TimerPanel | — | Banked across pauses; one active timer per person; stop writes a labor row | 3 unit tests (M2) + MOBILE_TEST_LOG M1/M2 close-out (88/88) |
| Mobile procedures & checklists | Partially working | procedure-panel.tsx, procedures.ts | Sectioned UI + progress; yes_no/safety_confirm; step photos; warn ranges | Long procedure completes on a phone; partial progress preserved | TEST_LOG Phase 5 |
| Camera and photo uploads | Working | components/attachments.tsx, storage/ | Progress + retry (P1 offline work) | Take photo on phone → appears on office computer | TEST_LOG Phases 3–6 |
| Completion notes | Verified | work-orders/wo-forms.tsx | — | Notes saved and visible to managers | TEST_LOG Phase 4 |
| Labor time | Verified | workOrders.ts addLabor + timers | — | Timer total matches elapsed; manual entry still available | MOBILE_TEST_LOG M1/M2 close-out (88/88) |
| Work requests from a phone | Verified | requests/, portal/[token] | — | Scenario A end-to-end | TEST_LOG Phase 6 |
| Manager request approval | Verified | requests/actions.ts | — | Approve → exactly one work order | TEST_LOG Phase 6 |
| Asset lookup | Verified | assets/ | — | Asset page readable at phone width | TEST_LOG Phase 3 |
| Asset QR scanning | Partially working | src/app/a/[token] | In-app scanner (currently needs the phone's camera app) | Scan in-app → asset actions by permission | TEST_LOG Phases 3, 12 |
| Meter readings from a phone | Verified | meters/, work-orders/[id] | — | Reading entered on the job page validates and saves | TEST_LOG Phases 8, 14 |
| Preventive maintenance completion | Verified | pm.ts + WO flow | — | Scenario B; next occurrence scheduled once | TEST_LOG Phase 7 |
| Backend permissions | Verified | server/auth/guards.ts | — | Scenario F role boundaries + anonymous 401 | TEST_LOG Phases 12, 13 |
| Audit history | Verified | services/audit.ts | — | Every field action writes an event | TEST_LOG Phases 1–11 |
| Responsive layout | Verified | all UI | — | No horizontal scroll at every tested width | MOBILE_TEST_LOG M1/M2 close-out (88/88) — desktop, Pixel 7, iPhone 14, Galaxy S8, iPad Mini |
| Secure remote access | Missing | docs/, deployment | MOBILE_REMOTE_ACCESS.md + HTTPS/VPN guidance; COOKIE_SECURE verified | Documented, tested path from outside the LAN | — |
| Reliable synchronization | Missing | new /api/field/* | Idempotent field endpoints | Replayed submission creates no duplicate | — |

## P1 — Required for reliable field use

| Feature | Status | Required work | Acceptance test |
|---|---|---|---|
| Offline procedure completion | Missing | Service worker + IndexedDB outbox | Steps completed offline appear after sync |
| Offline notes | Missing | Outbox | Note written offline lands once |
| Offline pictures | Missing | Blob retention until confirmed upload | Each photo appears exactly once (Scenario E) |
| Offline meter readings | Missing | Outbox + idempotency | No duplicate readings after double sync |
| Automatic retry | Missing | Sync manager | Queue drains when the network returns |
| Conflict detection | Missing | Preconditions → 409 → conflicts screen | Late change never silently overwrites newer server state |
| Installable PWA | Missing | manifest + icons + SW | Installs to home screen; opens standalone |
| Push notifications (where supported) | Missing | web-push + VAPID + subscriptions | Opt-in delivers an assignment notification |
| Signatures | Partially working | Drawn signature pad (typed name exists) | Signature captured and stored with the step |
| Corrective work from failed inspections | Verified | — | One corrective per failure |
| Manager mobile review | Verified | — | Manager approves/returns from a phone |
| Picture compression | Missing | Client canvas resize | Large photo uploads noticeably smaller, still legible |
| Saved mobile filters | Missing | Per-user saved list filters | Filter persists across sessions |
| Tested backup and restore | Verified | — | Restore executed with identical row counts |

## P2 — Deferred (do not build now)

Native iPhone/Android apps · GPS employee tracking · route planning ·
parts inventory · purchase orders · vendor management · IoT meter
integrations · voice transcription · AI summaries · advanced mobile
reporting.
