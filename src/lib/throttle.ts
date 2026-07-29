/**
 * Shared in-memory throttle: N failures for a key → locked for a window.
 * Sufficient for this single-process deployment (DECISIONS.md); the goal
 * is slowing brute force, not distributed rate limiting. Success clears
 * the key so legitimate users are never locked out after recovery.
 */
export function makeThrottle(maxFails: number, lockMs: number) {
  const failures = new Map<string, { count: number; lockedUntil: number }>();
  return {
    /** Returns remaining lock seconds, or 0 when the key may proceed. */
    check(key: string): number {
      const f = failures.get(key);
      if (!f) return 0;
      const remaining = f.lockedUntil - Date.now();
      return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
    },
    fail(key: string): void {
      const f = failures.get(key) ?? { count: 0, lockedUntil: 0 };
      f.count += 1;
      if (f.count >= maxFails) {
        f.lockedUntil = Date.now() + lockMs;
        f.count = 0;
      }
      failures.set(key, f);
    },
    succeed(key: string): void {
      failures.delete(key);
    },
  };
}
