import Link from "next/link";
import type { SessionUser } from "@/server/auth/session";
import type { FieldSummary } from "@/server/services/field";
import { formatDate } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { WoPriorityBadge, WoStatusBadge } from "@/components/wo-badges";

/**
 * The field home screen: what a technician needs in the first tap. Large
 * targets, plain language, and the two actions that start every field
 * task (submit a request, scan an asset) above the fold.
 */

function CountTile({
  label,
  value,
  href,
  tone = "default",
}: {
  label: string;
  value: number;
  href: string;
  tone?: "default" | "bad" | "warn";
}) {
  const valueColor =
    tone === "bad"
      ? "text-red-700"
      : tone === "warn"
        ? "text-amber-700"
        : "text-gray-900";
  return (
    <Link
      href={href}
      className="flex min-h-20 flex-col justify-center rounded-lg border border-gray-200 bg-white p-3 shadow-sm active:bg-gray-50"
    >
      <span className={`text-2xl font-bold tabular-nums ${valueColor}`}>
        {value}
      </span>
      <span className="mt-0.5 text-sm leading-tight text-gray-600">{label}</span>
    </Link>
  );
}

function BigAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-16 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-base font-semibold text-white shadow-sm active:bg-blue-800"
    >
      <span aria-hidden className="text-xl">
        {icon}
      </span>
      {label}
    </Link>
  );
}

function WoList({
  title,
  rows,
  timeZone,
  empty,
}: {
  title: string;
  rows: FieldSummary["mine"];
  timeZone: string;
  empty: string;
}) {
  return (
    <Card>
      <h2 className="mb-2 font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map(({ wo, siteName }) => {
            const overdue =
              wo.dueAt != null &&
              wo.dueAt < new Date() &&
              wo.status !== "completed" &&
              wo.status !== "canceled";
            return (
              <li key={wo.id}>
                <Link
                  href={`/work-orders/${wo.id}`}
                  className="-mx-2 block rounded px-2 py-2.5 active:bg-gray-50"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 font-medium text-blue-800">
                      {wo.woNumber} · {wo.title}
                    </span>
                    <WoPriorityBadge priority={wo.priority} />
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                    <WoStatusBadge status={wo.status} />
                    {siteName ? <span>{siteName}</span> : null}
                    {wo.dueAt ? (
                      <span className={overdue ? "font-semibold text-red-600" : ""}>
                        due {formatDate(wo.dueAt, timeZone)}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
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
    <div className="space-y-4">
      <PageHeader
        title={`Hi, ${user.displayName}`}
        subtitle="Your work for today."
      />

      <div className="flex gap-3">
        <BigAction href="/requests/new" icon="📝" label="New request" />
        <BigAction href="/scan" icon="📷" label="Scan asset" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <CountTile
          label="Assigned to me"
          value={summary.mine.length}
          href="/work-orders?mine=1"
        />
        <CountTile label="Due today" value={summary.today.length} href="/schedule" />
        <CountTile
          label="Overdue"
          value={summary.overdue.length}
          href="/work-orders?mine=1"
          tone={summary.overdue.length > 0 ? "bad" : "default"}
        />
        <CountTile
          label="In progress"
          value={summary.inProgress.length}
          href="/work-orders?mine=1"
        />
        <CountTile
          label="On hold"
          value={summary.onHold.length}
          href="/work-orders?mine=1"
          tone={summary.onHold.length > 0 ? "warn" : "default"}
        />
        <CountTile
          label="Maintenance due"
          value={summary.pmDue.length}
          href="/work-orders?mine=1"
        />
      </div>

      {unread > 0 ? (
        <Link
          href="/notifications"
          className="block rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-900 active:bg-blue-100"
        >
          🔔 {unread} new notification{unread === 1 ? "" : "s"}
        </Link>
      ) : null}

      <WoList
        title="Today"
        rows={todayRows}
        timeZone={timeZone}
        empty="Nothing scheduled for today."
      />
      <WoList
        title="All my work"
        rows={summary.mine}
        timeZone={timeZone}
        empty="Nothing assigned right now."
      />

      {summary.available.length > 0 ? (
        <Card>
          <h2 className="mb-2 font-semibold">
            Available to pick up ({summary.available.length})
          </h2>
          <ul className="divide-y divide-gray-100">
            {summary.available.slice(0, 5).map((wo) => (
              <li key={wo.id}>
                <Link
                  href={`/work-orders/${wo.id}`}
                  className="-mx-2 flex items-center justify-between gap-2 rounded px-2 py-2.5 text-sm active:bg-gray-50"
                >
                  <span className="font-medium text-blue-800">
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
          <h2 className="mb-2 font-semibold">Requests I submitted</h2>
          <ul className="divide-y divide-gray-100">
            {summary.myRequests.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link
                  href={`/requests/${r.id}`}
                  className="-mx-2 flex items-center justify-between gap-2 rounded px-2 py-2.5 text-sm active:bg-gray-50"
                >
                  <span className="font-medium text-blue-800">
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
