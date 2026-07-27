# Test Log

Every test cycle is recorded here per master prompt §18: date/time, commit or
working-tree reference, feature tested, commands run, automated result,
manual result, browser, test user role, failures found, fix applied,
evidence, final result. Newest entries at the bottom of each phase section.

Nothing in FEATURE_MATRIX.md may be marked **Verified** without an entry
here. Tests that cannot be run are recorded as **Not Tested** with a reason.

---

## Phase 0 — Foundation

### 2026-07-27 — Scaffold verification (pre-first-commit working tree)

- **Feature tested:** project scaffold — migrations on clean DB, typecheck,
  lint, production build, dev-server page render.
- **Commands run:**
  - `npx drizzle-kit generate` → produced `drizzle/0000_rare_sentinels.sql`
    (org_settings, 5 columns, singleton check)
  - `npm run db:migrate` → "Migrations complete." against fresh `cmms_dev`;
    `\dt` shows `org_settings`
  - `npm run typecheck` → clean (after fixing pg-boss v12 named-export import
    and typing the error handler in `src/worker/index.ts`)
  - `npm run lint` → clean (after rewriting `eslint.config.mjs` for
    eslint-config-next 16's native flat-config exports; FlatCompat no longer
    works with it)
  - `npm run build` → ✓ Compiled successfully; routes `/` and `/_not-found`
  - Dev-server smoke: `npm run dev` + `curl http://localhost:3000/` →
    HTTP 200, body contains "Maintenance Manager"
- **Automated test result:** n/a (no unit tests exist yet — first tests land
  in Phase 1 with auth)
- **Manual result:** pass (curl-level; browser drive starts in Phase 1)
- **Browser:** none (curl)
- **Test user role:** none (no auth yet)
- **Failures found & fixes:** (1) `import PgBoss from "pg-boss"` fails under
  pg-boss 12 → switched to named import. (2) FlatCompat +
  eslint-config-next 16 throws in config-validator → native flat config.
- **Final result:** PASS — scaffold verified end to end on a clean database.
