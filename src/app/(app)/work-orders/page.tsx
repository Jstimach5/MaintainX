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
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
} from "@/components/ui";
import { ListLayout } from "@/components/layout";
import { WoPriorityBadge, WoStatusBadge } from "@/components/wo-badges";

export const metadata = { title: "Work orders" };

const RAIL: Record<string, string> = {
  in_progress: "bg-amber-400",
  paused: "bg-amber-300",
  completed: "bg-green-500",
  canceled: "bg-red-400",
};

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

  const isOverdue = (wo: (typeof rows)[number]["wo"]) =>
    wo.dueAt != null &&
    wo.dueAt < now &&
    wo.status !== "completed" &&
    wo.status !== "canceled";

  return (
    <ListLayout>
      <PageHeader
        title="Work orders"
        subtitle={`${rows.length} shown`}
        actions={
          canCreate ? (
            <ButtonLink href="/work-orders/new">New work order</ButtonLink>
          ) : undefined
        }
      />
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search title or number…"
          aria-label="Search work orders"
          inline
          className="w-full sm:w-56"
        />
        <Select
          name="status"
          defaultValue={params.status ?? ""}
          inline
          aria-label="Status"
        >
          <option value="">All open</option>
          {WO_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select
          name="priority"
          defaultValue={params.priority ?? ""}
          inline
          aria-label="Priority"
        >
          <option value="">All priorities</option>
          {WO_PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
        <Select
          name="type"
          defaultValue={params.type ?? ""}
          inline
          aria-label="Work type"
        >
          <option value="">All types</option>
          {WO_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
        <Select
          name="site"
          defaultValue={params.site ?? ""}
          inline
          aria-label="Site"
        >
          <option value="">All sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <label className="flex min-h-11 items-center gap-1.5 text-sm text-gray-600">
          <input
            type="checkbox"
            name="mine"
            value="1"
            defaultChecked={params.mine === "1"}
            className="h-4 w-4 accent-brand-800"
          />
          Mine
        </label>
        <label className="flex min-h-11 items-center gap-1.5 text-sm text-gray-600">
          <input
            type="checkbox"
            name="done"
            value="1"
            defaultChecked={params.done === "1"}
            className="h-4 w-4 accent-brand-800"
          />
          Include finished
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="No work orders found"
          hint="Adjust the filters or create one."
          action={
            canCreate ? (
              <ButtonLink href="/work-orders/new" variant="secondary">
                New work order
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Phones: record cards with a status rail (always paired with the badge). */}
          <Card className="divide-y divide-gray-100 p-0 md:hidden">
            {rows.map(({ wo, siteName, locationName, teamName, assignees }) => {
              const overdue = isOverdue(wo);
              const rail = overdue
                ? "bg-red-500"
                : (RAIL[wo.status] ?? "bg-gray-300");
              return (
                <Link
                  key={wo.id}
                  href={`/work-orders/${wo.id}`}
                  className="relative block py-3 pr-4 pl-5 active:bg-gray-50"
                >
                  <span
                    aria-hidden
                    className={`absolute inset-y-3 left-2 w-1 rounded-full ${rail}`}
                  />
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 font-medium text-brand-800">
                      {wo.woNumber} · {wo.title}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <WoPriorityBadge priority={wo.priority} />
                      <WoStatusBadge status={wo.status} />
                    </span>
                  </span>
                  <span className="mt-0.5 block text-sm text-gray-500">
                    {siteName}
                    {locationName ? ` › ${locationName}` : ""}
                    {assignees.length > 0
                      ? ` · ${assignees.join(", ")}`
                      : teamName
                        ? ` · Team ${teamName}`
                        : " · Unassigned"}
                    {wo.dueAt ? (
                      <span
                        className={
                          overdue ? "font-semibold text-red-700" : undefined
                        }
                      >
                        {" "}
                        · {overdue ? "overdue" : "due"}{" "}
                        {formatDateTime(wo.dueAt, org.timezone)}
                      </span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </Card>
          {/* Desktop: a real table that uses the width. */}
          <Card className="hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs tracking-wide text-gray-500 uppercase">
                  <th className="px-4 py-2.5 font-semibold">Work order</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Priority</th>
                  <th className="px-3 py-2.5 font-semibold">Site / location</th>
                  <th className="px-3 py-2.5 font-semibold">Assigned</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(
                  ({ wo, siteName, locationName, teamName, assignees }) => {
                    const overdue = isOverdue(wo);
                    return (
                      <tr key={wo.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/work-orders/${wo.id}`}
                            className="font-medium text-brand-800 hover:underline"
                          >
                            {wo.woNumber} · {wo.title}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5">
                          <WoStatusBadge status={wo.status} />
                        </td>
                        <td className="px-3 py-2.5">
                          <WoPriorityBadge priority={wo.priority} />
                        </td>
                        <td className="max-w-56 truncate px-3 py-2.5 text-gray-600">
                          {siteName}
                          {locationName ? ` › ${locationName}` : ""}
                        </td>
                        <td className="max-w-48 truncate px-3 py-2.5 text-gray-600">
                          {assignees.length > 0
                            ? assignees.join(", ")
                            : teamName
                              ? `Team ${teamName}`
                              : "—"}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right whitespace-nowrap ${
                            overdue
                              ? "font-semibold text-red-700"
                              : "text-gray-600"
                          }`}
                        >
                          {wo.dueAt ? (
                            <>
                              {overdue ? "overdue · " : ""}
                              {formatDateTime(wo.dueAt, org.timezone)}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </Card>

        </>
      )}
    </ListLayout>
  );
}
