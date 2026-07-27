/**
 * PM recurrence math on YYYY-MM-DD calendar dates. Pure calendar-part
 * arithmetic — no timestamps involved — so DST can never shift a due date
 * (DECISIONS.md #5). Month math clamps to the shorter month's last day
 * (Jan 31 + 1 month = Feb 28/29).
 */
export type RecurUnit = "day" | "week" | "month" | "year";

function parts(isoDate: string): [number, number, number] {
  const [y, m, d] = isoDate.split("-").map(Number);
  return [y, m, d];
}

function fmt(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addRecurrence(
  isoDate: string,
  unit: RecurUnit,
  interval: number,
): string {
  const [y, m, d] = parts(isoDate);
  switch (unit) {
    case "day":
    case "week": {
      const days = unit === "week" ? interval * 7 : interval;
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() + days);
      return dt.toISOString().slice(0, 10);
    }
    case "month": {
      const total = (m - 1) + interval;
      const ny = y + Math.floor(total / 12);
      const nm = (total % 12) + 1;
      return fmt(ny, nm, Math.min(d, daysInMonth(ny, nm)));
    }
    case "year": {
      const ny = y + interval;
      return fmt(ny, m, Math.min(d, daysInMonth(ny, m)));
    }
  }
}

/** Project the next `count` due dates starting from (and including) start. */
export function projectOccurrences(
  start: string,
  unit: RecurUnit,
  interval: number,
  count: number,
  endDate?: string | null,
): string[] {
  const out: string[] = [];
  let cursor = start;
  for (let i = 0; i < count; i++) {
    if (endDate && cursor > endDate) break;
    out.push(cursor);
    cursor = addRecurrence(cursor, unit, interval);
  }
  return out;
}
