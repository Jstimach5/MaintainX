import Link from "next/link";
import { requireRole } from "@/server/auth/guards";
import {
  WO_PRIORITIES,
  WO_STATUSES,
  WO_TYPES,
  listWorkOrders,
  type WoPriorityValue,
  type WoStatusValue,
  type WoTypeValue,
} from "@/server/services/workOrders";
import { managerWarnings } from "@/server/services/reports";
import { listSites } from "@/server/services/sites";
import { listUsers } from "@/server/services/users";
import { getOrgSettings } from "@/server/services/org";
import { formatDate, formatDateTime, todayInTimezone } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { WoPriorityBadge, WoStatusBadge } from "../work-orders/wo-badges";
import Link2 from "next/link";
import { CalendarView, TimelineView } from "./views";

export const metadata = { title: "Schedule" };

function WarningList({
  title,
  items,
}: {
  title: string;
  items: { text: string; href: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-sm font-semibold text-amber-900">{title}</p>
      <ul className="mt-0.5 space-y-0.5">
        {items.map((i, idx) => (
          <li key={idx} className="text-sm">
            <Link href={i.href} className="text-amber-800 underline hover:text-amber-950">
              {i.text}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // Technicians get the same calendar/timeline, scoped to their own
  // assigned work; the operation-wide view and warnings stay manager-only.
  const user = await requireRole("admin", "manager", "technician");
  const isTech = user.role === "technician";
  const params = await searchParams;
  const org = await getOrgSettings();
  const tz = org.timezone;
  const today = todayInTimezone(tz);

  const status = WO_STATUSES.some((s) => s.value === params.status)
    ? (params.status as WoStatusValue)
    : undefined;
  const priority = WO_PRIORITIES.some((p) => p.value === params.priority)
    ? (params.priority as WoPriorityValue)
    : undefined;
  const workType = WO_TYPES.some((t) => t.value === params.type)
    ? (params.type as WoTypeValue)
    : undefined;
  const siteId = params.site ? Number(params.site) : undefined;
  // Technicians are pinned to their own work; the assignee filter is
  // enforced here, not just hidden in the UI below.
  const assigneeId = isTech
    ? user.id
    : params.assignee
      ? Number(params.assignee)
      : undefined;

  const view =
    params.view === "calendar" || params.view === "timeline"
      ? params.view
      : "table";
  const [rows, sites, people, warnings] = await Promise.all([
    listWorkOrders({
      status,
      priority,
      workType,
      siteId: Number.isInteger(siteId) ? siteId : undefined,
      assigneeId: Number.isInteger(assigneeId) ? assigneeId : undefined,
      includeDone:
        params.done === "1" || status !== undefined || view === "calendar",
    }),
    listSites({ activeOnly: true }),
    isTech ? Promise.resolve([]) : listUsers(),
    isTech ? Promise.resolve(null) : managerWarnings(today),
  ]);

  const warningItems = warnings === null ? [] : [
    ...warnings.overduePm.map((p) => ({
      text: `Overdue PM: ${p.name} (due ${formatDate(p.nextDue, tz)})`,
      href: `/pm-plans/${p.id}`,
    })),
    ...warnings.offlineAfterCompletion.map((a) => ({
      text: `${a.assetNumber} ${a.name} is still offline but all its work is finished`,
      href: `/assets/${a.id}`,
    })),
    ...warnings.downtimeConflicts.map((a) => ({
      text: `${a.assetNumber} ${a.name}: ${a.openDowntimeWos} open work orders both plan downtime`,
      href: `/assets/${a.id}`,
    })),
    ...warnings.scheduledPastDue.map((w) => ({
      text: `${w.woNumber} is planned to start after its deadline`,
      href: `/work-orders/${w.id}`,
    })),
    ...warnings.archivedAssetWork.map((w) => ({
      text: `${w.woNumber} references archived asset ${w.assetNumber}`,
      href: `/work-orders/${w.id}`,
    })),
    ...warnings.inactiveAssignee.map((w) => ({
      text: `${w.woNumber} is assigned to deactivated user ${w.userName}`,
      href: `/work-orders/${w.id}`,
    })),
  ];

  return (
    <div>
      <PageHeader
        title={isTech ? "My schedule" : "Schedule & progress"}
        subtitle={
          isTech
            ? "Your assigned work, on a calendar you can check from your phone."
            : "All work across the operation, with the problems surfaced first."
        }
      />

      {warningItems.length > 0 ? (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <h2 className="mb-1 font-semibold text-amber-900">
            ⚠ Needs attention ({warningItems.length})
          </h2>
          <div className="space-y-2">
            <WarningList title="" items={warningItems} />
          </div>
        </Card>
      ) : null}

      <div className="mb-3 flex gap-1 rounded-md bg-gray-100 p-1 text-sm font-medium w-fit">
        {(["table", "calendar", "timeline"] as const).map((v) => (
          <Link2
            key={v}
            href={`/schedule?view=${v}`}
            className={`rounded px-3 py-1.5 capitalize ${view === v ? "bg-white shadow-sm text-blue-800" : "text-gray-600 hover:text-gray-900"}`}
          >
            {v}
          </Link2>
        ))}
      </div>

      {view === "calendar" ? (
        <CalendarView
          rows={rows}
          month={
            params.month && /^\d{4}-\d{2}$/.test(params.month)
              ? params.month
              : today.slice(0, 7)
          }
          timeZone={tz}
          today={today}
          baseQs=""
        />
      ) : null}
      {view === "timeline" ? (
        <TimelineView
          rows={rows}
          timeZone={tz}
          today={today}
          group={
            params.group === "team" || params.group === "assignee"
              ? params.group
              : "site"
          }
        />
      ) : null}
      {view === "timeline" ? (
        <p className="mt-2 mb-4 text-sm text-gray-500">
          Group by:{" "}
          {(["site", "team", "assignee"] as const).map((g) => (
            <Link2
              key={g}
              href={`/schedule?view=timeline&group=${g}`}
              className={`mr-2 ${params.group === g || (!params.group && g === "site") ? "font-semibold text-blue-800" : "text-blue-600 hover:underline"}`}
            >
              {g}
            </Link2>
          ))}
        </p>
      ) : null}

      {view !== "table" ? null : (
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <select name="status" defaultValue={params.status ?? ""} className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-base">
          <option value="">All open</option>
          {WO_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select name="priority" defaultValue={params.priority ?? ""} className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-base">
          <option value="">All priorities</option>
          {WO_PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={params.type ?? ""} className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-base">
          <option value="">All types</option>
          {WO_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select name="site" defaultValue={params.site ?? ""} className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-base">
          <option value="">All sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {isTech ? null : (
          <select name="assignee" defaultValue={params.assignee ?? ""} className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-base">
            <option value="">Anyone</option>
            {people
              .filter((p) => p.isActive && p.role !== "requester")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
          </select>
        )}
        <label className="flex min-h-11 items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" name="done" value="1" defaultChecked={params.done === "1"} className="h-4 w-4" />
          Include finished
        </label>
        <button type="submit" className="min-h-11 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
          Filter
        </button>
      </form>
      )}

      {view !== "table" ? null : (
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase">
              <th className="px-4 py-2">Work order</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Priority</th>
              <th className="px-2 py-2">Site</th>
              <th className="px-2 py-2">Assigned</th>
              <th className="px-2 py-2">Planned start</th>
              <th className="px-2 py-2">Due</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ wo, siteName, teamName, assignees }) => {
              const overdue =
                wo.dueAt &&
                wo.dueAt < new Date() &&
                wo.status !== "completed" &&
                wo.status !== "canceled";
              return (
                <tr key={wo.id} className="border-b border-gray-100 align-top hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link href={`/work-orders/${wo.id}`} className="font-medium text-blue-800 hover:underline">
                      {wo.woNumber} · {wo.title}
                    </Link>
                    {wo.flagged ? <Badge tone="red" className="ml-1">flagged</Badge> : null}
                  </td>
                  <td className="px-2 py-2">
                    <WoStatusBadge status={wo.status} />
                  </td>
                  <td className="px-2 py-2">
                    <WoPriorityBadge priority={wo.priority} />
                  </td>
                  <td className="px-2 py-2">{siteName}</td>
                  <td className="px-2 py-2">
                    {assignees.length > 0
                      ? assignees.join(", ")
                      : teamName
                        ? `Team ${teamName}`
                        : <span className="text-amber-700">Unassigned</span>}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {wo.plannedStartAt ? formatDateTime(wo.plannedStartAt, tz) : "—"}
                  </td>
                  <td className={`px-2 py-2 whitespace-nowrap ${overdue ? "font-semibold text-red-600" : ""}`}>
                    {wo.dueAt ? formatDateTime(wo.dueAt, tz) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">Nothing matches these filters.</p>
        ) : null}
      </Card>
      )}
    </div>
  );
}
