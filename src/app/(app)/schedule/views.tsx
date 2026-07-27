import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import type { listWorkOrders } from "@/server/services/workOrders";
import { addDays } from "@/lib/format";

type WoListRow = Awaited<ReturnType<typeof listWorkOrders>>[number];

/** Day key (YYYY-MM-DD) of a timestamp in the org timezone. */
function dayKey(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// ---------------------------------------------------------------------------
// Calendar (month grid of due dates)
// ---------------------------------------------------------------------------

export function CalendarView({
  rows,
  month, // YYYY-MM
  timeZone,
  today,
  baseQs,
}: {
  rows: WoListRow[];
  month: string;
  timeZone: string;
  today: string;
  baseQs: string;
}) {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // Weekday of the 1st (0=Sun) — calendar math on the plain date.
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const prevMonth = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  const nextMonth = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;

  const byDay = new Map<string, WoListRow[]>();
  for (const r of rows) {
    if (!r.wo.dueAt) continue;
    const key = dayKey(r.wo.dueAt, timeZone);
    if (!key.startsWith(month)) continue;
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(r);
  }

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));

  const cells: (string | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">{monthLabel}</h2>
        <span className="flex gap-2 text-sm">
          <Link href={`/schedule?${baseQs}&view=calendar&month=${prevMonth}`} className="text-blue-700 hover:underline">
            ← previous
          </Link>
          <Link href={`/schedule?${baseQs}&view=calendar&month=${nextMonth}`} className="text-blue-700 hover:underline">
            next →
          </Link>
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[700px] grid-cols-7 gap-px rounded-md bg-gray-200 text-sm">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="bg-gray-50 px-2 py-1 text-center text-xs font-semibold text-gray-500 uppercase">
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            const items = day ? (byDay.get(day) ?? []) : [];
            const isToday = day === today;
            return (
              <div
                key={i}
                className={`min-h-24 bg-white p-1.5 ${isToday ? "ring-2 ring-blue-500 ring-inset" : ""}`}
              >
                {day ? (
                  <>
                    <p className={`text-xs ${isToday ? "font-bold text-blue-700" : "text-gray-400"}`}>
                      {Number(day.slice(-2))}
                    </p>
                    {items.slice(0, 3).map((r) => {
                      const overdue =
                        day < today &&
                        r.wo.status !== "completed" &&
                        r.wo.status !== "canceled";
                      return (
                        <Link
                          key={r.wo.id}
                          href={`/work-orders/${r.wo.id}`}
                          className={`mt-0.5 block truncate rounded px-1 py-0.5 text-xs ${
                            overdue
                              ? "bg-red-100 text-red-800"
                              : r.wo.status === "completed"
                                ? "bg-green-50 text-green-800"
                                : "bg-blue-50 text-blue-800"
                          }`}
                          title={`${r.wo.woNumber} · ${r.wo.title}`}
                        >
                          {r.wo.title}
                        </Link>
                      );
                    })}
                    {items.length > 3 ? (
                      <p className="mt-0.5 text-[10px] text-gray-400">
                        +{items.length - 3} more
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Timeline (next 14 days, grouped rows, downtime highlighted)
// ---------------------------------------------------------------------------

export function TimelineView({
  rows,
  timeZone,
  today,
  group,
}: {
  rows: WoListRow[];
  timeZone: string;
  today: string;
  group: "site" | "team" | "assignee";
}) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));

  const groups = new Map<string, WoListRow[]>();
  for (const r of rows) {
    const keys =
      group === "site"
        ? [r.siteName]
        : group === "team"
          ? [r.teamName ?? "No team"]
          : r.assignees.length > 0
            ? r.assignees
            : ["Unassigned"];
    for (const key of keys) {
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
    }
  }

  function span(r: WoListRow): { start: number; end: number } | null {
    const startKey = r.wo.plannedStartAt
      ? dayKey(r.wo.plannedStartAt, timeZone)
      : r.wo.dueAt
        ? dayKey(r.wo.dueAt, timeZone)
        : null;
    const endKey = r.wo.dueAt ? dayKey(r.wo.dueAt, timeZone) : startKey;
    if (!startKey || !endKey) return null;
    // Clamp overdue starts to today so the bar stays in the window.
    const s = Math.max(0, days.indexOf(startKey) === -1 && startKey < today ? 0 : days.indexOf(startKey));
    const e = days.indexOf(endKey) === -1 ? (endKey < today ? 0 : 13) : days.indexOf(endKey);
    if (days.indexOf(startKey) === -1 && days.indexOf(endKey) === -1 && !(startKey < today && endKey >= days[13])) {
      if (endKey < today) return null; // fully in the past
    }
    return { start: Math.min(s, 13), end: Math.max(Math.min(e, 13), Math.min(s, 13)) };
  }

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold">Next 14 days</h2>
        <span className="flex items-center gap-2 text-xs text-gray-500">
          <Badge tone="purple">planned downtime</Badge>
          <Badge tone="blue">work</Badge>
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid" style={{ gridTemplateColumns: "10rem repeat(14, 1fr)" }}>
            <div />
            {days.map((d) => (
              <div
                key={d}
                className={`border-l border-gray-100 px-1 py-0.5 text-center text-[10px] ${d === today ? "font-bold text-blue-700" : "text-gray-400"}`}
              >
                {Number(d.slice(-2))}
              </div>
            ))}
          </div>
          {[...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, items]) => (
            <div key={label} className="border-t border-gray-100">
              <div className="grid items-start" style={{ gridTemplateColumns: "10rem repeat(14, 1fr)" }}>
                <p className="truncate py-2 pr-2 text-sm font-medium" title={label}>
                  {label}
                </p>
                <div className="col-span-14 grid gap-y-1 py-1" style={{ gridTemplateColumns: "repeat(14, 1fr)" }}>
                  {items.map((r) => {
                    const pos = span(r);
                    if (!pos) return null;
                    const downtime = (r.wo.plannedDowntimeMinutes ?? 0) > 0;
                    return (
                      <Link
                        key={r.wo.id}
                        href={`/work-orders/${r.wo.id}`}
                        title={`${r.wo.woNumber} · ${r.wo.title}`}
                        className={`block truncate rounded-[4px] px-1.5 py-0.5 text-xs ${
                          downtime
                            ? "bg-purple-100 text-purple-900"
                            : "bg-blue-100 text-blue-900"
                        }`}
                        style={{
                          gridColumnStart: pos.start + 1,
                          gridColumnEnd: pos.end + 2,
                        }}
                      >
                        {r.wo.title}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
          {groups.size === 0 ? (
            <p className="p-3 text-sm text-gray-500">
              Nothing scheduled in the next two weeks.
            </p>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Bars run from planned start to due date. Work orders without dates
        appear only in the table view.
      </p>
      <div className="mt-2">
        <WoStatusBadgeLegend />
      </div>
    </Card>
  );
}

function WoStatusBadgeLegend() {
  return (
    <p className="text-xs text-gray-400">
      Click a bar to open the work order. Conflicts on critical assets are
      listed in the warnings panel above.
    </p>
  );
}
