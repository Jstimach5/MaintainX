import Link from "next/link";
import { requireUser } from "@/server/auth/guards";
import { listWorkOrders } from "@/server/services/workOrders";
import { listRequests, REQUEST_STATUSES } from "@/server/services/requests";
import { backlog, managerWarnings } from "@/server/services/reports";
import { listAssets } from "@/server/services/assets";
import { getOrgSettings } from "@/server/services/org";
import { formatDateTime, todayInTimezone } from "@/lib/format";
import { Badge, ButtonLink, Card, KpiTile, PageHeader } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import { DashboardGrid } from "@/components/layout";
import { WoPriorityBadge, WoStatusBadge } from "@/components/wo-badges";
import {
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Inbox,
  MessageSquare,
  TriangleAlert,
  User,
} from "@/components/icons";
import { fieldSummary } from "@/server/services/field";
import { unreadCount } from "@/server/services/notifications";
import { FieldHome } from "./field-home";

export const metadata = { title: "Dashboard" };

const REQUEST_TONES: Record<string, BadgeTone> = Object.fromEntries(
  REQUEST_STATUSES.map((s) => [s.value, s.tone]),
);

function SectionHeader({
  title,
  href,
  hrefLabel,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold tracking-wide text-gray-900 uppercase">
        {title}
      </h2>
      {href ? (
        <Link
          href={href}
          className="text-sm font-medium text-brand-800 hover:underline"
        >
          {hrefLabel ?? "View all"}
        </Link>
      ) : null}
    </div>
  );
}

function WoRow({
  wo,
  tz,
  overdue,
}: {
  wo: {
    id: number;
    woNumber: string;
    title: string;
    priority: string;
    status: string;
    dueAt: Date | null;
  };
  tz: string;
  overdue?: boolean;
}) {
  return (
    <li>
      {/*
        Stacked on phones, one line from `sm` up. Side by side at 390px the
        priority badge plus a full "overdue · Jul 29, 2026, 3:48 PM" leaves
        the title about one character — the final captures showed this row
        rendering as "W…", which is worse than no row at all.
      */}
      <Link
        href={`/work-orders/${wo.id}`}
        className="-mx-2 flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
      >
        <span className="min-w-0 max-w-full truncate font-medium text-brand-800">
          {wo.woNumber} · {wo.title}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <WoPriorityBadge priority={wo.priority as never} />
          {wo.dueAt ? (
            <span
              className={
                overdue
                  ? "text-xs font-semibold text-red-700"
                  : "text-xs text-gray-500"
              }
            >
              {overdue ? "overdue · " : "due "}
              {formatDateTime(wo.dueAt, tz)}
            </span>
          ) : (
            <WoStatusBadge status={wo.status as never} />
          )}
        </span>
      </Link>
    </li>
  );
}

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
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title={`Hi, ${user.displayName}`}
          subtitle="Submit maintenance requests and track their progress."
          actions={<ButtonLink href="/requests/new">New request</ButtonLink>}
        />
        <Card>
          <SectionHeader title="Your recent requests" href="/requests" />
          {own.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nothing yet — when something needs fixing, submit a request and
              track its progress here.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {own.slice(0, 10).map(({ request }) => (
                <li key={request.id}>
                  <Link
                    href={`/requests/${request.id}`}
                    className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm hover:bg-gray-50"
                  >
                    <span className="min-w-0 truncate font-medium text-brand-800">
                      {request.requestNumber} · {request.title}
                    </span>
                    <Badge tone={REQUEST_TONES[request.status] ?? "gray"}>
                      {request.status.replace(/_/g, " ")}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    );
  }

  const isManager = user.role === "admin" || user.role === "manager";
  const [mine, backlogStats, assetRows, requests, allRows] = await Promise.all([
    listWorkOrders({ assigneeId: user.id }),
    backlog(),
    listAssets({}),
    isManager ? listRequests({ status: "submitted" }) : Promise.resolve([]),
    listWorkOrders({}),
  ]);
  const assetsDown = assetRows.filter(
    (r) =>
      r.asset.status === "offline" || r.asset.status === "unplanned_downtime",
  );
  const warnings = isManager
    ? await managerWarnings(todayInTimezone(tz))
    : null;

  const now = new Date();
  const dated = allRows
    .filter((r) => r.wo.dueAt)
    .sort((a, b) => a.wo.dueAt!.getTime() - b.wo.dueAt!.getTime());
  const overdueRows = dated.filter((r) => r.wo.dueAt! < now).slice(0, 6);
  const upcomingRows = dated.filter((r) => r.wo.dueAt! >= now).slice(0, 6);

  const attention = warnings
    ? [
        {
          label: "Overdue preventive maintenance",
          count: warnings.overduePm.length,
          href: "/pm-plans",
        },
        {
          label: "Scheduled to start after due date",
          count: warnings.scheduledPastDue.length,
          href: "/schedule",
        },
        {
          label: "Asset still offline after completed work",
          count: warnings.offlineAfterCompletion.length,
          href: "/assets?status=offline",
        },
        {
          label: "Downtime conflicts",
          count: warnings.downtimeConflicts.length,
          href: "/schedule",
        },
        {
          label: "Open work on archived assets",
          count: warnings.archivedAssetWork.length,
          href: "/schedule",
        },
        {
          label: "Assigned to deactivated users",
          count: warnings.inactiveAssignee.length,
          href: "/schedule",
        },
      ].filter((w) => w.count > 0)
    : [];

  return (
    <DashboardGrid>
      <div className="col-span-12">
        <PageHeader
          title="Dashboard"
          subtitle={`${org.name} · signed in as ${user.displayName}`}
          actions={
            <>
              <ButtonLink href="/work-orders/new">New work order</ButtonLink>
              <ButtonLink href="/requests/new" variant="secondary">
                New request
              </ButtonLink>
            </>
          }
        />
      </div>

      {/* At-a-glance — every tile links to the list it counts. */}
      <div className="col-span-12 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Open work orders"
          value={backlogStats.open}
          href="/work-orders"
          icon={<ClipboardList />}
        />
        <KpiTile
          label="Overdue"
          value={backlogStats.overdue}
          tone={backlogStats.overdue > 0 ? "bad" : "good"}
          href="/schedule"
          icon={<TriangleAlert />}
        />
        <KpiTile
          label="Unassigned"
          value={backlogStats.unassigned}
          tone={backlogStats.unassigned > 0 ? "warn" : "default"}
          href="/work-orders"
          icon={<Inbox />}
        />
        <KpiTile
          label="Assigned to me"
          value={mine.length}
          href="/work-orders?mine=1"
          icon={<User />}
        />
        <KpiTile
          label="Assets down"
          value={assetsDown.length}
          tone={assetsDown.length > 0 ? "bad" : "good"}
          href="/assets?status=offline"
          icon={<Boxes />}
        />
        {isManager ? (
          <KpiTile
            label="New requests"
            value={requests.length}
            tone={requests.length > 0 ? "warn" : "default"}
            href="/requests?status=submitted"
            icon={<MessageSquare />}
          />
        ) : (
          <KpiTile
            label="Schedule"
            value="→"
            href="/schedule"
            icon={<CalendarDays />}
          />
        )}
      </div>

      {isManager ? (
        <Card className="col-span-12 lg:col-span-6">
          <SectionHeader
            title="Needs attention"
            href="/schedule"
            hrefLabel="View schedule"
          />
          {attention.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-gray-600">
              <CheckCircle2 aria-hidden className="h-4 w-4 text-green-600" />
              All clear — no consistency warnings right now.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {attention.map((w) => (
                <li key={w.label}>
                  <Link
                    href={w.href}
                    className="-mx-2 flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-gray-50"
                  >
                    <TriangleAlert
                      aria-hidden
                      className="h-4 w-4 shrink-0 text-amber-600"
                    />
                    <span className="min-w-0 flex-1">{w.label}</span>
                    <span className="font-semibold text-amber-700 tabular-nums">
                      {w.count}
                    </span>
                    <ChevronRight
                      aria-hidden
                      className="h-4 w-4 text-gray-400"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <Card className="col-span-12 lg:col-span-6">
        <SectionHeader title="Overdue" href="/schedule" hrefLabel="View schedule" />
        {overdueRows.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-gray-600">
            <CheckCircle2 aria-hidden className="h-4 w-4 text-green-600" />
            Nothing overdue.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {overdueRows.map(({ wo }) => (
              <WoRow key={wo.id} wo={wo} tz={tz} overdue />
            ))}
          </ul>
        )}
      </Card>

      <Card className="col-span-12 lg:col-span-6">
        <SectionHeader title="Upcoming" href="/schedule" hrefLabel="View schedule" />
        {upcomingRows.length === 0 ? (
          <p className="text-sm text-gray-500">No dated work coming up.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {upcomingRows.map(({ wo }) => (
              <WoRow key={wo.id} wo={wo} tz={tz} />
            ))}
          </ul>
        )}
      </Card>

      <Card className="col-span-12 lg:col-span-6">
        <SectionHeader title="Assigned to me" href="/work-orders?mine=1" />
        {mine.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing assigned right now.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {mine.slice(0, 6).map(({ wo }) => (
              <WoRow key={wo.id} wo={wo} tz={tz} />
            ))}
          </ul>
        )}
      </Card>

      {isManager && requests.length > 0 ? (
        <Card className="col-span-12 lg:col-span-6">
          <SectionHeader
            title="New requests"
            href="/requests?status=submitted"
          />
          <ul className="divide-y divide-gray-100">
            {requests.slice(0, 6).map(({ request }) => (
              <li key={request.id}>
                <Link
                  href={`/requests/${request.id}`}
                  className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50"
                >
                  <span className="min-w-0 truncate font-medium text-brand-800">
                    {request.requestNumber} · {request.title}
                  </span>
                  <Badge tone={REQUEST_TONES[request.status] ?? "gray"}>
                    {request.status.replace(/_/g, " ")}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {assetsDown.length > 0 ? (
        <Card className="col-span-12 lg:col-span-6">
          <SectionHeader title="Asset issues" href="/assets" />
          <ul className="divide-y divide-gray-100">
            {assetsDown.slice(0, 6).map(({ asset, siteName }) => (
              <li key={asset.id}>
                <Link
                  href={`/assets/${asset.id}`}
                  className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-brand-800">
                      {asset.assetNumber} · {asset.name}
                    </span>
                    {siteName ? (
                      <span className="text-gray-500"> · {siteName}</span>
                    ) : null}
                  </span>
                  <Badge tone="red">{asset.status.replace(/_/g, " ")}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </DashboardGrid>
  );
}
