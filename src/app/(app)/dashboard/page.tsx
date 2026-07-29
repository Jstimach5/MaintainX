import Link from "next/link";
import { requireUser } from "@/server/auth/guards";
import { listWorkOrders } from "@/server/services/workOrders";
import { listRequests } from "@/server/services/requests";
import { backlog, managerWarnings } from "@/server/services/reports";
import { listAssets } from "@/server/services/assets";
import { getOrgSettings } from "@/server/services/org";
import { formatDateTime, todayInTimezone } from "@/lib/format";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { StatTile } from "@/components/charts";
import { WoStatusBadge } from "../work-orders/wo-badges";
import { fieldSummary } from "@/server/services/field";
import { unreadCount } from "@/server/services/notifications";
import { FieldHome } from "./field-home";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const org = await getOrgSettings();
  const tz = org.timezone;

  // Technicians get the field home screen — their day's work, not the
  // operation's analytics. Managers keep the analytical dashboard.
  if (user.role === "technician") {
    const [summary, unread] = await Promise.all([
      fieldSummary(user, todayInTimezone(tz), tz),
      unreadCount(user.id),
    ]);
    return (
      <FieldHome user={user} summary={summary} timeZone={tz} unread={unread} />
    );
  }

  // Requesters get a simple portal-style dashboard.
  if (user.role === "requester") {
    const own = await listRequests({ requesterId: user.id });
    return (
      <div>
        <PageHeader
          title={`Hi, ${user.displayName}`}
          subtitle="Submit maintenance requests and track their progress."
          actions={<ButtonLink href="/requests/new">New request</ButtonLink>}
        />
        <Card>
          <h2 className="mb-2 font-semibold">Your recent requests</h2>
          {own.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing yet.</p>
          ) : (
            <ul className="space-y-1">
              {own.slice(0, 10).map(({ request }) => (
                <li key={request.id} className="text-sm">
                  <Link href={`/requests/${request.id}`} className="text-blue-700 hover:underline">
                    {request.requestNumber} · {request.title}
                  </Link>
                  <span className="text-gray-400"> · {request.status.replace("_", " ")}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    );
  }

  const isManager = user.role === "admin" || user.role === "manager";
  const [mine, backlogStats, assetRows, requests] = await Promise.all([
    listWorkOrders({ assigneeId: user.id }),
    backlog(),
    listAssets({}),
    isManager ? listRequests({ status: "submitted" }) : Promise.resolve([]),
  ]);
  const assetsDown = assetRows.filter(
    (r) => r.asset.status === "offline" || r.asset.status === "unplanned_downtime",
  ).length;
  const warnings = isManager
    ? await managerWarnings(todayInTimezone(tz))
    : null;
  const warningCount = warnings
    ? warnings.overduePm.length +
      warnings.offlineAfterCompletion.length +
      warnings.downtimeConflicts.length +
      warnings.scheduledPastDue.length +
      warnings.archivedAssetWork.length +
      warnings.inactiveAssignee.length
    : 0;

  const dueSoon = (await listWorkOrders({}))
    .filter((r) => r.wo.dueAt)
    .sort((a, b) => a.wo.dueAt!.getTime() - b.wo.dueAt!.getTime())
    .slice(0, 8);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        subtitle={`Signed in as ${user.displayName} (${user.role})`}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Open work orders" value={backlogStats.open} href="/work-orders" />
        <StatTile
          label="Overdue"
          value={backlogStats.overdue}
          tone={backlogStats.overdue > 0 ? "bad" : "good"}
          href={isManager ? "/schedule" : "/work-orders"}
        />
        <StatTile label="Assigned to me" value={mine.length} href="/work-orders?mine=1" />
        <StatTile
          label="Assets down"
          value={assetsDown}
          tone={assetsDown > 0 ? "bad" : "good"}
          href="/assets?status=offline"
        />
        {isManager ? (
          <StatTile
            label="New requests"
            value={requests.length}
            href="/requests?status=submitted"
          />
        ) : (
          <StatTile label="Unassigned" value={backlogStats.unassigned} href="/work-orders" />
        )}
      </div>

      {isManager && warningCount > 0 ? (
        <Card className="border-amber-300 bg-amber-50">
          <p className="text-sm text-amber-900">
            ⚠ <strong>{warningCount}</strong> item{warningCount === 1 ? "" : "s"} need
            attention —{" "}
            <Link href="/schedule" className="underline">
              see the schedule view
            </Link>
            .
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">Assigned to me</h2>
          {mine.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing assigned right now.</p>
          ) : (
            <ul className="space-y-1.5">
              {mine.slice(0, 8).map(({ wo }) => (
                <li key={wo.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/work-orders/${wo.id}`} className="text-blue-700 hover:underline">
                    {wo.woNumber} · {wo.title}
                  </Link>
                  <WoStatusBadge status={wo.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Due soon</h2>
          {dueSoon.length === 0 ? (
            <p className="text-sm text-gray-500">No dated work coming up.</p>
          ) : (
            <ul className="space-y-1.5">
              {dueSoon.map(({ wo }) => {
                const overdue = wo.dueAt && wo.dueAt < new Date();
                return (
                  <li key={wo.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/work-orders/${wo.id}`} className="text-blue-700 hover:underline">
                      {wo.woNumber} · {wo.title}
                    </Link>
                    <span className={overdue ? "font-semibold text-red-600" : "text-gray-500"}>
                      {formatDateTime(wo.dueAt!, tz)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
