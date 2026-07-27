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
import { listSites } from "@/server/services/sites";
import { getOrgSettings } from "@/server/services/org";
import { formatDateTime } from "@/lib/format";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { WoPriorityBadge, WoStatusBadge } from "./wo-badges";

export const metadata = { title: "Work orders" };

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    priority?: string;
    type?: string;
    site?: string;
    mine?: string;
    done?: string;
  }>;
}) {
  const user = await requireRole("admin", "manager", "technician");
  const params = await searchParams;
  const org = await getOrgSettings();

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

  const [rows, sites] = await Promise.all([
    listWorkOrders({
      q: params.q,
      status,
      priority,
      workType,
      siteId: Number.isInteger(siteId) ? siteId : undefined,
      assigneeId: params.mine === "1" ? user.id : undefined,
      includeDone: params.done === "1" || status !== undefined,
    }),
    listSites({ activeOnly: true }),
  ]);

  const canCreate = user.role === "admin" || user.role === "manager";
  const now = new Date();

  return (
    <div>
      <PageHeader
        title="Work orders"
        subtitle={`${rows.length} shown`}
        actions={
          canCreate ? (
            <ButtonLink href="/work-orders/new">New work order</ButtonLink>
          ) : undefined
        }
      />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search title or number…"
          className="min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base sm:w-56"
        />
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
        <label className="flex min-h-11 items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" name="mine" value="1" defaultChecked={params.mine === "1"} className="h-4 w-4" />
          Mine
        </label>
        <label className="flex min-h-11 items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" name="done" value="1" defaultChecked={params.done === "1"} className="h-4 w-4" />
          Include finished
        </label>
        <button type="submit" className="min-h-11 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
          Filter
        </button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No work orders found" hint="Adjust the filters or create one." />
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {rows.map(({ wo, siteName, locationName, teamName, assignees }) => {
            const overdue =
              wo.dueAt &&
              wo.dueAt < now &&
              wo.status !== "completed" &&
              wo.status !== "canceled";
            return (
              <div key={wo.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/work-orders/${wo.id}`}
                    className="font-medium text-blue-800 hover:underline"
                  >
                    {wo.woNumber} · {wo.title}
                  </Link>
                  <div className="flex items-center gap-1.5">
                    <WoPriorityBadge priority={wo.priority} />
                    <WoStatusBadge status={wo.status} />
                  </div>
                </div>
                <p className="mt-0.5 text-sm text-gray-500">
                  {siteName}
                  {locationName ? ` › ${locationName}` : ""}
                  {assignees.length > 0 ? ` · ${assignees.join(", ")}` : teamName ? ` · Team ${teamName}` : " · Unassigned"}
                  {wo.dueAt ? (
                    <span className={overdue ? "font-semibold text-red-600" : ""}>
                      {" "}
                      · due {formatDateTime(wo.dueAt, org.timezone)}
                    </span>
                  ) : null}
                </p>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
