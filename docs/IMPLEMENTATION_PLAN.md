# Implementation Plan

Phased build order. Every phase runs the §17 loop before it closes: build,
typecheck, lint, unit/integration tests, start the real app, drive the
feature through the UI, check console/server logs/DB/uploads/jobs, test
failure cases and permission boundaries, record in TEST_LOG.md, update
FEATURE_MATRIX.md and PROJECT_STATE.md. Regressions found are fixed before
the next feature begins. One phase ≈ one or more commits; the app is runnable
after every phase.

## Architecture summary

- Next.js App Router; server actions for mutations, route handlers for file
  serving/portal/API needs. Every mutation: action → `requireRole()` guard →
  service function (transaction) → audit event (same transaction).
- `src/server/services/*` hold domain logic as framework-independent,
  unit-testable functions. `src/server/db/schema.ts` is the single Drizzle
  schema; SQL migrations in `drizzle/`.
- `src/worker/index.ts` (pg-boss) runs PM generation, meter evaluation,
  imports, notification fan-out.
- `src/server/storage/` adapter interface + local-disk driver; uploads
  validated (type allowlist, size, no executables) and served auth-gated.
- Timezone/idempotency/session rules per DECISIONS.md #3/#5/#6.

## Phases

- **Phase 0 — Foundation.** Scaffold (Next 16, TS strict, Tailwind 4,
  Drizzle, pg-boss, Vitest, Playwright, docker-compose), initial migration
  (org_settings), docs system. Check: build/typecheck/lint/migrate/dev all
  pass on a clean DB.
- **Phase 1 — Auth + RBAC + users/teams.** Sessions (scrypt + DB tokens),
  four roles, `requireRole()` pattern, first-run admin setup, users/teams
  admin, deactivation revokes sessions, audit-event plumbing used by all
  later phases. Permission-matrix unit tests; login e2e.
- **Phase 2 — Sites + nested locations.** CRUD, parent/child tree, archival
  rules, list/filter primitives reused app-wide.
- **Phase 3 — Assets.** Full §6 fields, parent/sub-assets, status + location
  histories, transfers, pictures/documents via storage adapter, QR values +
  printable labels, asset page panels.
- **Phase 4 — Work orders core.** §7 fields, numbering, statuses + history,
  assignments, multi-asset, sub-WOs, comments, attachments
  (before/during/after), labor time, filters that persist, mobile cards,
  technician quick actions. Pictures survive restart.
- **Phase 5 — Procedures.** Template builder (all step types, conditional
  follow-ups, min/max), versioned snapshot on attach, mobile step-through,
  completion blocking, failed inspection → flag + corrective request.
- **Phase 6 — Work requests + portal.** §8 statuses, review/approve/decline/
  convert (duplicate-conversion blocked by constraint), per-site tokenized
  public portal (rate-limited), requester visibility without internal notes,
  in-app notifications behind an adapter. Scenario A e2e.
- **Phase 7 — Preventive maintenance.** §9 plans, pg-boss generation with
  unique occurrence keys, fixed vs floating, horizon/advance windows,
  late/early/missed handling, org-TZ + DST-safe, upcoming preview. Scenario B
  e2e + double-run duplicate test.
- **Phase 8 — Meters.** §10 meters, readings + validation + correction with
  audit, trend chart, threshold/interval triggers → exactly-one WO
  (watermark + unique constraint). Scenario C e2e.
- **Phase 9 — Manager view + reporting core.** §11 table view, filters,
  warning set; §13 reports with CSV export + drill-down; KPI definitions
  unit-tested (canceled ≠ completed).
- **Phase 10 — Bulk imports.** §12 full workflow: mapping templates,
  whole-file validation, dry-run, duplicate strategies, background job with
  live progress, row-error download, audit record, safe rollback, 10k-row
  test, spreadsheet-content sanitization. Scenario D e2e.
- **Phase 11 — Audit browser + backups + mobile pass + seed.** Admin audit
  browser; backup script + tested restore + BACKUP_AND_RESTORE.md; §21 mobile
  pass; §20 seed data; clean-DB migration re-verify.
- **Phase 12 — P1 set.** Timeline/calendar + downtime planning (Scenario E),
  auto-corrective WOs, saved dashboards + print reports, QR scan flows,
  import-rollback polish, notification completeness, Scenarios A–F all green,
  DEPLOYMENT/ADMIN_GUIDE/USER_GUIDE.
- **Phase 13 — Done sweep.** §23 checklist on a clean DB; §24 delivery
  report with exact commands and evidence.

## Test strategy

- **Vitest**: service-level tests against `cmms_test` (migrations applied
  fresh), permission matrix (role × action), PM recurrence math incl. DST,
  meter watermarks, import validation/normalization, KPI calculations.
- **Playwright**: Scenarios A–F from §19 as specified, plus mobile-viewport
  runs of technician flows (project `mobile`, tag `@mobile`). Chromium from
  `/opt/pw-browsers`.
- Every cycle logged in TEST_LOG.md with commands + evidence.
