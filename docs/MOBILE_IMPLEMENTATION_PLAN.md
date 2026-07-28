# Mobile Implementation Plan

Derived from docs/MOBILE_AUDIT.md. Phases are vertical slices; the §22
self-tracking loop runs inside each one (build → test → drive the UI at
mobile widths → check logs/DB/uploads → record evidence → update
MOBILE_TEST_LOG.md and MOBILE_FEATURE_MATRIX.md and PROJECT_STATE.md →
commit and push).

## Architecture decisions

1. **Responsive PWA inside the existing app.** No second frontend, no
   second database, no second login. Small screens get field-first
   navigation and screens; desktop keeps the current chrome.
2. **Offline mutations go through a small idempotent field API.** Next
   server actions cannot be replayed from a queue, so offline-capable
   writes get JSON route handlers under `/api/field/*`, each carrying a
   client-generated idempotency key enforced by a unique index — the same
   idempotency-by-constraint rule as DECISIONS.md #6. The client keeps an
   IndexedDB outbox (photo blobs retained until the server confirms),
   retries automatically, offers manual sync, shows pending state, and
   warns before sign-out with unsynced work.
3. **Conflicts are surfaced, never resolved silently.** Field writes carry
   preconditions; a stale write returns 409 with the server's current
   state, the client shows the conflict, and the resolution is audited.
4. **Statuses** gain `paused` and `waiting_approval`; `waiting` is
   relabelled "Waiting for parts". Completion approval is an org setting,
   default off.
5. **Labor timer** lives in `work_order_timers` with one active timer per
   user (partial unique index); stopping writes an ordinary
   `work_order_labor` row so all existing reporting keeps working.
6. **Signatures** are drawn on a canvas and stored as attachments linked
   to the procedure step; the typed-name path stays as a fallback.
7. **Pinned new dependencies only:** `jsqr` (scanner), `web-push`
   (notifications), `sharp` (thumbnails).

## Phases

| Phase | Scope | Priority |
|---|---|---|
| **M0** | Land Phase 14; write the mobile docs set; add iPhone / small-Android / tablet Playwright projects | — |
| **M1** | Field shell: bottom nav, field home screen, sticky work-order action bar | P0 |
| **M2** | Lifecycle + time: `paused`/`waiting_approval`, pause/hold reasons, manager return + optional approval, labor timer | P0 |
| **M3** | Work list filters/sort/badges + in-app QR scanner | P0 |
| **M4** | Mobile procedures: sectioned UI with progress, per-step photos, warning ranges, `yes_no`/`safety_confirm`, drawn signatures | P0/P1 |
| **M5** | Required picture categories as a completion gate; request-form polish | P0 |
| **M6** | PWA install + offline capture + sync queue + conflict handling | P1 |
| **M7** | Push notifications, image compression + thumbnails, saved mobile filters | P1 |
| **M8** | Remote-access and security documentation; Scenarios A–F across viewports; clean-DB definition-of-done sweep | P0/P1 |

## Testing strategy

- **Viewports:** iPhone 14, Pixel 7, Galaxy S8 (small Android), iPad Mini,
  desktop Chrome. Field specs are tagged so the matrix stays fast.
- **Scenarios (§21):** A request→approval→one work order; B routine PM
  completion end-to-end; C failed inspection with required documentation;
  D offline completion with double sync and zero duplicates; E interrupted
  photo upload with each picture exactly once; F permission enforcement
  including private attachments and disabled sessions.
- **Offline is only claimed after a network-disabled run** —
  `context.setOffline(true)`, then sync twice and assert no duplication.
- Every phase records commands, results, failures, and fixes in
  MOBILE_TEST_LOG.md before any matrix row is marked Verified.

## Out of scope (stays on the office computer)

Bulk imports, user/team administration, procedure and PM builders,
reporting dashboards and exports, the audit browser, backup/restore.
