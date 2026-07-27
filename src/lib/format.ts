/**
 * Date/time display helpers. All timestamps are stored UTC; display is
 * always in the ORG timezone (DECISIONS.md #5) — never the server's zone.
 * Calendar-date math also lives here so `date('now')`-style UTC bugs can't
 * creep in per-page.
 */

export function formatDateTime(d: Date | string | null, timeZone: string): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(d: Date | string | null, timeZone: string): string {
  if (!d) return "—";
  // Plain YYYY-MM-DD calendar dates have no zone; render verbatim.
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, day)));
  }
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

/** Today's calendar date (YYYY-MM-DD) in the given IANA timezone. */
export function todayInTimezone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Add whole days to a YYYY-MM-DD calendar date (DST-safe by construction). */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** String compare works for YYYY-MM-DD; helper for readability. */
export function isBefore(a: string, b: string): boolean {
  return a < b;
}

/**
 * Interpret a datetime-local string ("YYYY-MM-DDTHH:MM") as wall time in the
 * given IANA zone and return the UTC instant. Two-pass offset correction
 * handles DST transitions. This is how all user-entered date/times become
 * timestamps (DECISIONS.md #5) — never `new Date(str)` (server-zone).
 */
export function wallTimeToUtc(wall: string, timeZone: string): Date | null {
  const m = wall.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, ys, ms, ds, hs, mins] = m;
  const [y, mo, d, h, min] = [ys, ms, ds, hs, mins].map(Number);
  const target = Date.UTC(y, mo - 1, d, h, min);
  let utc = target;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 2; i++) {
    const parts = fmt.formatToParts(new Date(utc));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const shown = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
    );
    utc += target - shown;
  }
  return new Date(utc);
}
