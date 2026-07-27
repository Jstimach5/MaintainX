# Gap Analysis

Date: 2026-07-27

Because the repository was empty at audit time (see CURRENT_STATE_AUDIT.md),
**every** requirement in the master specification is a gap. This document maps
specification sections to the build phases that close them, so the gap list
doubles as a traceability matrix. Detailed feature-level status lives in
FEATURE_MATRIX.md.

| Spec section | Requirement area | Closed by phase |
|---|---|---|
| §4 | User roles + backend enforcement | Phase 1 |
| §5 | Sites, nested locations, org structure | Phase 2 |
| §6 | Asset management + histories + QR | Phase 3 (QR flows finalized Phase 12) |
| §7 | Work orders, procedures, pictures/files | Phases 4–5 |
| §8 | Work requests + portal + notifications | Phase 6 |
| §9 | Preventive maintenance | Phase 7 |
| §10 | Meters | Phase 8 |
| §11 | Manager scheduling/timeline/downtime | Phase 9 (table+warnings), Phase 12 (timeline/calendar/downtime) |
| §12 | Bulk imports | Phase 10 |
| §13 | Reporting | Phase 9 (core), Phase 12 (saved dashboards/print) |
| §14 | Audit history | Phase 1 (plumbing), Phase 11 (browser) |
| §15 | Data model | Incremental per phase; extension points for parts documented |
| §16 | Reliability & security | Cross-cutting; backups Phase 11 |
| §17–18 | Self-tracking loop + docs | Phase 0 (this commit), maintained every phase |
| §19 | Automated tests incl. Scenarios A–F | Built per phase; all green by Phase 12 |
| §20 | Seed data | Phase 11 |
| §21 | UX requirements | Cross-cutting; mobile pass Phase 11 |
| §22–24 | Priorities, definition of done, delivery | Phase 13 |

## Notable non-gaps (explicitly out of scope)

Parts/inventory, purchase orders, vendors, IoT, workforce optimization, AI
features, native apps, SSO, multi-org — all P2, deliberately deferred. The
schema keeps documented extension points (DECISIONS.md #4) so the parts module
can be added later without rewriting work orders or assets.
