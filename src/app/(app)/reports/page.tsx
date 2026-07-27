import { requireRole } from "@/server/auth/guards";
import {
  backlog,
  completedBySite,
  completedByTeam,
  completedByTechnician,
  completionStats,
  downtimeByAsset,
  meterTriggeredCount,
  pmCompliance,
  preventiveVsReactive,
  repeatFailures,
  requestStats,
  woCountsByPriority,
  woCountsByStatus,
  woCountsByType,
  type ReportFilters,
} from "@/server/services/reports";
import { listSites } from "@/server/services/sites";
import { woStatusLabel, type WoStatusValue } from "@/server/services/workOrders";
import { Card, PageHeader } from "@/components/ui";
import { BarRows, StatTile } from "@/components/charts";

export const metadata = { title: "Reports" };

function minutesLabel(min: number): string {
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}h ${min % 60}m` : `${min}m`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; site?: string }>;
}) {
  await requireRole("admin", "manager");
  const params = await searchParams;
  const filters: ReportFilters = {};
  if (params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from)) {
    filters.from = new Date(`${params.from}T00:00:00Z`);
  }
  if (params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to)) {
    filters.to = new Date(`${params.to}T23:59:59Z`);
  }
  if (params.site && Number.isInteger(Number(params.site))) {
    filters.siteId = Number(params.site);
  }

  const [
    sites,
    byStatus,
    byPriority,
    byType,
    backlogStats,
    byTech,
    byTeam,
    bySite,
    completion,
    compliance,
    pvr,
    downtime,
    repeats,
    reqStats,
    meterCount,
  ] = await Promise.all([
    listSites({ activeOnly: true }),
    woCountsByStatus(filters),
    woCountsByPriority(filters),
    woCountsByType(filters),
    backlog(filters),
    completedByTechnician(filters),
    completedByTeam(filters),
    completedBySite(filters),
    completionStats(filters),
    pmCompliance(filters),
    preventiveVsReactive(filters),
    downtimeByAsset(filters),
    repeatFailures(filters),
    requestStats(filters),
    meterTriggeredCount(filters),
  ]);

  const exportQs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        subtitle="Counts always distinguish completed from canceled — canceled work is never counted as done."
      />

      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="text-sm text-gray-600">
          From
          <input type="date" name="from" defaultValue={params.from ?? ""} className="mt-0.5 block min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-base" />
        </label>
        <label className="text-sm text-gray-600">
          To
          <input type="date" name="to" defaultValue={params.to ?? ""} className="mt-0.5 block min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-base" />
        </label>
        <select name="site" defaultValue={params.site ?? ""} className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-base">
          <option value="">All sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="submit" className="min-h-11 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
          Apply
        </button>
        <a
          href={`/reports/export?${exportQs}`}
          className="min-h-11 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50"
        >
          Export CSV
        </a>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Open backlog" value={backlogStats.open} href="/work-orders" />
        <StatTile
          label="Overdue"
          value={backlogStats.overdue}
          tone={backlogStats.overdue > 0 ? "bad" : "good"}
          href="/schedule"
        />
        <StatTile label="Unassigned" value={backlogStats.unassigned} href="/schedule" />
        <StatTile label="Completed (range)" value={completion.completed} />
        <StatTile
          label="Avg completion"
          value={`${completion.avgHours.toFixed(1)}h`}
        />
        <StatTile
          label="PM compliance"
          value={
            compliance.complianceRate != null
              ? `${Math.round(compliance.complianceRate * 100)}%`
              : "—"
          }
          tone={
            compliance.complianceRate != null && compliance.complianceRate < 0.8
              ? "bad"
              : "default"
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">Work orders by status</h2>
          <BarRows
            rows={byStatus.map((r) => ({
              label: woStatusLabel(r.key as WoStatusValue),
              value: r.count,
              href: `/work-orders?status=${r.key}`,
            }))}
          />
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">By priority</h2>
          <BarRows
            rows={byPriority.map((r) => ({
              label: r.key,
              value: r.count,
              href: `/work-orders?priority=${r.key}&done=1`,
            }))}
          />
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">By work type</h2>
          <BarRows
            rows={byType.map((r) => ({
              label: r.key,
              value: r.count,
              href: `/work-orders?type=${r.key}&done=1`,
            }))}
          />
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Preventive vs reactive</h2>
          <BarRows
            rows={[
              { label: "Preventive", value: pvr.preventive },
              { label: "Reactive", value: pvr.reactive },
              { label: "Other", value: pvr.other },
            ]}
          />
          <p className="mt-2 text-xs text-gray-500">
            Meter-triggered work orders in range: {meterCount}
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Completed by technician</h2>
          <BarRows
            rows={byTech.map((r) => ({ label: r.name, value: r.completed }))}
          />
          {byTech.length > 0 ? (
            <p className="mt-2 text-xs text-gray-500">
              Labor logged:{" "}
              {byTech
                .map((r) => `${r.name} ${minutesLabel(r.laborMinutes)}`)
                .join(" · ")}
            </p>
          ) : null}
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Completed by team / site</h2>
          <BarRows
            rows={[
              ...byTeam.map((r) => ({ label: `Team ${r.teamName}`, value: r.completed })),
              ...bySite.map((r) => ({ label: r.siteName, value: r.completed })),
            ]}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">Estimated vs actual labor</h2>
          <p className="text-sm">
            Estimated: <strong>{minutesLabel(completion.estimatedMinutes)}</strong>
            {" · "}
            Actual logged: <strong>{minutesLabel(completion.actualMinutes)}</strong>
            {completion.estimatedMinutes > 0 ? (
              <span className="text-gray-500">
                {" "}
                ({Math.round((completion.actualMinutes / completion.estimatedMinutes) * 100)}% of estimate)
              </span>
            ) : null}
          </p>
          <h2 className="mt-4 mb-2 font-semibold">PM compliance detail</h2>
          <p className="text-sm text-gray-600">
            {compliance.onTime} on time · {compliance.late} late ·{" "}
            {compliance.open} still open (of {compliance.total} due)
          </p>
          <h2 className="mt-4 mb-2 font-semibold">Requests</h2>
          <p className="text-sm text-gray-600">
            {reqStats.total} submitted ·{" "}
            {reqStats.approvalRate != null
              ? `${Math.round(reqStats.approvalRate * 100)}% approved`
              : "none decided"}{" "}
            · avg response {reqStats.avgResponseHours.toFixed(1)}h
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Downtime by asset (completed work)</h2>
          {downtime.length === 0 ? (
            <p className="text-sm text-gray-400">No downtime recorded in range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase">
                    <th className="py-1 pr-3">Asset</th>
                    <th className="py-1 pr-3 text-right">Planned</th>
                    <th className="py-1 pr-3 text-right">Actual</th>
                    <th className="py-1 text-right">WOs</th>
                  </tr>
                </thead>
                <tbody>
                  {downtime.map((d) => (
                    <tr key={d.assetId} className="border-b border-gray-100">
                      <td className="py-1.5 pr-3">
                        {d.assetNumber} {d.assetName}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {minutesLabel(d.plannedMinutes)}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {minutesLabel(d.actualMinutes)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{d.workOrderCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h2 className="mt-4 mb-2 font-semibold">Repeat failures</h2>
          {repeats.length === 0 ? (
            <p className="text-sm text-gray-400">
              No asset has failed twice in this range.
            </p>
          ) : (
            <BarRows
              rows={repeats.map((r) => ({
                label: `${r.assetNumber} ${r.assetName}`,
                value: r.failures,
                href: `/assets/${r.assetId}`,
              }))}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
