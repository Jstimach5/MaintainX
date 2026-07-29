# Production Test Log

Evidence for the launch cycle. Same rule as TEST_LOG.md: nothing is
marked done from code inspection alone.

---

## P0 — Audit + preservation

### 2026-07-29

- `git status` clean at `1a3a7ba`; branch `claude/asset-tracking-software-lltwy3`
  tracking origin.
- **Found + fixed:** bare `storage/` gitignore rule had excluded
  `src/server/storage/index.ts` from **every commit to date** — clean
  clones/ZIPs could not build (`git ls-files` count for the directory was
  0; probe-file check-ignore confirmed). Fixed and pushed as `9a7a52d`
  (rule anchored to `/storage/`, module tracked).
- Rollback point `9a7a52d` pushed; local tag + branch
  `pre-production-launch-2026-07` (remote tag/branch pushes rejected by
  the session's branch-scoped git proxy — SHA is the durable remote
  reference).
- Claim checks: `24f2a1e` not in this history; adapter path is
  `src/server/storage/index.ts`; remote push access works.
- `npm test` at `9a7a52d`: **159/159** (after restarting the sandbox's
  Postgres service, which had idled — ECONNREFUSED on first attempt was
  environmental, not a product failure).
- 88/88 Playwright recorded at `0c78247`; only docs changed since.
