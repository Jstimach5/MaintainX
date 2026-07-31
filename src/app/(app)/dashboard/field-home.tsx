import Link from "next/link";
import type { ComponentType } from "react";
import type { SessionUser } from "@/server/auth/session";
import type { FieldSummary } from "@/server/services/field";
import { formatDate } from "@/lib/format";
import { Card, KpiTile } from "@/components/ui";
import { WoPriorityBadge, WoStatusBadge } from "@/components/wo-badges";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Inbox,
  QrCode,
  Repeat2,
  Timer,
  TriangleAlert,
  User,
  Wrench,
} from "@/components/icons";

/**
 * The field home screen: what a technician needs in the first tap. Large
 * targets, plain language, and the two actions that start every field
 * task (submit a request, scan an asset) above the fold.
 */

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const WO_RAIL: Record<string, string> = {
  in_progress: "bg-amber-400",
  paused: "bg-amber-300",
  completed: "bg-green-500",
  canceled: "bg-red-400",
};

function BigAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: IconType;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-16 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-800 px-4 text-base font-semibold text-white shadow-sm active:bg-brand-900"
    >
      <Icon aria-hidden className="h-5 w-5" />
      <span className="whitespace-nowrap">{label}</span>
    </Link>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: IconType; children: React.ReactNode }) {
  return (
    <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold tracking-wide text-gray-900 uppercase">
      <Icon aria-hidden className="h-4 w-4 text-brand-700" />
      {children}
    </h2>
  );
}

/** Work card with a status rail — the rail always pairs with the text badge. */
function WoCard({
  wo,
  siteName,
  timeZone,
}: {
  wo: FieldSummary["mine"][number]["wo"];
  siteName: string | null;
  timeZone: string;
}) {
  const overdue =
    wo.dueAt != null &&
    wo.dueAt < new Date() &&
    wo.status !== "completed" &&
    wo.status !== "canceled";
  const rail = overdue ? "bg-red-500" : (WO_RAIL[wo.status] ?? "bg-gray-300");
  return (
    <li>
      <Link
        href={`/work-orders/${wo.id}`}
        className="relative -mx-2 block rounded-md py-2.5 pr-2 pl-4 active:bg-gray-50"
      >
        <span
          aria-hidden
          className={`absolute inset-y-2 left-0 w-1 rounded-full ${rail}`}
        />
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 font-medium text-brand-800">
            {wo.woNumber} · {wo.title}
          </span>
          <WoPriorityBadge priority={wo.priority} />
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
          <WoStatusBadge status={wo.status} />
          {siteName ? <span>{siteName}</span> : null}
          {wo.dueAt ? (
            <span className={overdue ? "font-semibold text-red-700" : undefined}>
              {overdue ? "overdue — was due" : "due"}{" "}
              {formatDate(wo.dueAt, timeZone)}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

function WoList({
  title,
  icon,
  rows,
  timeZone,
  empty,
}: {
  title: string;
  icon: IconType;
  rows: FieldSummary["mine"];
  timeZone: string;
  empty: string;
}) {
  return (
    <Card>
      <SectionTitle icon={icon}>{title}</SectionTitle>
      {rows.length === 0 ? (
        <p className="flex items-start gap-2 text-sm text-gray-500">
          <CheckCircle2
            aria-hidden
            className="mt-0.5 h-4 w-4 shrink-0 text-green-600"
          />
          {empty}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map(({ wo, siteName }) => (
            <WoCard
              key={wo.id}
              wo={wo}
              siteName={siteName}
              timeZone={timeZone}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

export function FieldHome({
  user,
  summary,
  timeZone,
  unread,
}: {
  user: SessionUser;
  summary: FieldSummary;
  timeZone: string;
  unread: number;
}) {
  const todayIds = new Set(summary.today.map((w) => w.id));
  const todayRows = summary.mine.filter((r) => todayIds.has(r.wo.id));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.2em] text-brand-900 uppercase">
          Your work for today
        </p>
        <h1 className="text-xl font-bold sm:text-2xl">
          Hi, {user.displayName}
        </h1>
      </div>

      <div className="flex gap-3">
        <BigAction
          href="/requests/new"
          icon={ClipboardList}
          label="New request"
        />
        <BigAction href="/scan" icon={QrCode} label="Scan asset" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiTile
          label="Assigned to me"
          value={summary.mine.length}
          href="/work-orders?mine=1"
          icon={<User />}
        />
        <KpiTile
          label="Due today"
          value={summary.today.length}
          href="/schedule"
          icon={<CalendarDays />}
        />
        <KpiTile
          label="Overdue"
          value={summary.overdue.length}
          href="/work-orders?mine=1"
          tone={summary.overdue.length > 0 ? "bad" : "default"}
          icon={<TriangleAlert />}
        />
        <KpiTile
          label="In progress"
          value={summary.inProgress.length}
          href="/work-orders?mine=1"
          icon={<Timer />}
        />
        <KpiTile
          label="On hold"
          value={summary.onHold.length}
          href="/work-orders?mine=1"
          tone={summary.onHold.length > 0 ? "warn" : "default"}
          icon={<Wrench />}
        />
        <KpiTile
          label="Maintenance due"
          value={summary.pmDue.length}
          href="/work-orders?mine=1"
          icon={<Repeat2 />}
        />
      </div>

      {unread > 0 ? (
        <Link
          href="/notifications"
          className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm font-medium text-brand-900 active:bg-brand-100"
        >
          <Bell aria-hidden className="h-4 w-4 text-brand-800" />
          {unread} new notification{unread === 1 ? "" : "s"}
        </Link>
      ) : null}

      {todayRows.length > 0 ? (
        <WoList
          title="Today"
          icon={CalendarDays}
          rows={todayRows}
          timeZone={timeZone}
          empty=""
        />
      ) : null}
      <WoList
        title={todayRows.length > 0 ? "All my work" : "My work"}
        icon={Wrench}
        rows={summary.mine}
        timeZone={timeZone}
        empty="Nothing assigned right now — pick up available work below, or scan an asset to get started."
      />

      {summary.available.length > 0 ? (
        <Card>
          <SectionTitle icon={Inbox}>
            Available to pick up ({summary.available.length})
          </SectionTitle>
          <ul className="divide-y divide-gray-100">
            {summary.available.slice(0, 5).map((wo) => (
              <li key={wo.id}>
                <Link
                  href={`/work-orders/${wo.id}`}
                  className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2.5 text-sm active:bg-gray-50"
                >
                  <span className="min-w-0 font-medium text-brand-800">
                    {wo.woNumber} · {wo.title}
                  </span>
                  <WoPriorityBadge priority={wo.priority} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {summary.myRequests.length > 0 ? (
        <Card>
          <SectionTitle icon={ClipboardList}>Requests I submitted</SectionTitle>
          <ul className="divide-y divide-gray-100">
            {summary.myRequests.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link
                  href={`/requests/${r.id}`}
                  className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2.5 text-sm active:bg-gray-50"
                >
                  <span className="min-w-0 font-medium text-brand-800">
                    {r.requestNumber} · {r.title}
                  </span>
                  <span className="text-xs text-gray-500">
                    {r.status.replace(/_/g, " ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
