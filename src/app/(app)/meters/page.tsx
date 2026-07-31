import Link from "next/link";
import { requireRole } from "@/server/auth/guards";
import { listMeters } from "@/server/services/meters";
import { getOrgSettings } from "@/server/services/org";
import { formatDateTime } from "@/lib/format";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { ListLayout } from "@/components/layout";

export const metadata = { title: "Meters" };

export default async function MetersPage() {
  const user = await requireRole("admin", "manager", "technician");
  const rows = await listMeters();
  const org = await getOrgSettings();
  const canManage = user.role !== "technician";

  const decorated = rows.map((row) => {
    const value =
      row.meter.currentValue != null ? Number(row.meter.currentValue) : null;
    const warnAt =
      row.meter.warnThreshold != null ? Number(row.meter.warnThreshold) : null;
    const criticalAt =
      row.meter.criticalThreshold != null
        ? Number(row.meter.criticalThreshold)
        : null;
    return {
      ...row,
      value,
      warnAt,
      criticalAt,
      warn: value != null && warnAt != null && value >= warnAt,
      critical: value != null && criticalAt != null && value >= criticalAt,
    };
  });

  return (
    <ListLayout>
      <PageHeader
        title="Meters"
        subtitle="Hours, miles, cycles, temperatures — with triggers that generate work automatically."
        actions={
          canManage ? (
            <ButtonLink href="/meters/new">Add meter</ButtonLink>
          ) : undefined
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No meters yet"
          hint="Add a meter like 'Generator run hours' and set a service trigger."
          action={
            canManage ? (
              <ButtonLink href="/meters/new" variant="secondary">
                Add meter
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Phones: reading first, thresholds underneath. */}
          <Card className="divide-y divide-gray-100 p-0 md:hidden">
            {decorated.map((r) => (
              <Link
                key={r.meter.id}
                href={`/meters/${r.meter.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 active:bg-gray-50"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-brand-800">
                    {r.meter.name}
                  </span>
                  <span className="block text-sm text-gray-500">
                    {r.assetName
                      ? `${r.assetNumber} ${r.assetName}`
                      : (r.locationName ?? "—")}
                    {r.meter.currentReadingAt
                      ? ` · last ${formatDateTime(r.meter.currentReadingAt, org.timezone)}`
                      : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {r.critical ? (
                    <Badge tone="red">critical</Badge>
                  ) : r.warn ? (
                    <Badge tone="amber">warning</Badge>
                  ) : null}
                  {!r.meter.isActive ? <Badge tone="gray">inactive</Badge> : null}
                  <span className="text-lg font-semibold tabular-nums">
                    {r.value != null ? `${r.value} ${r.meter.unit}` : "—"}
                  </span>
                </span>
              </Link>
            ))}
          </Card>

          {/* Desktop: current reading against its thresholds, at a glance. */}
          <Card className="hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs tracking-wide text-gray-500 uppercase">
                  <th className="px-4 py-2.5 font-semibold">Meter</th>
                  <th className="px-3 py-2.5 font-semibold">Asset / location</th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Current
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold">Warn</th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Critical
                  </th>
                  <th className="px-3 py-2.5 font-semibold">State</th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    Last reading
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {decorated.map((r) => (
                  <tr key={r.meter.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/meters/${r.meter.id}`}
                        className="font-medium text-brand-800 hover:underline"
                      >
                        {r.meter.name}
                      </Link>
                    </td>
                    <td className="max-w-64 truncate px-3 py-2.5 text-gray-600">
                      {r.assetName
                        ? `${r.assetNumber} ${r.assetName}`
                        : (r.locationName ?? "—")}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-semibold tabular-nums ${
                        r.critical
                          ? "text-red-700"
                          : r.warn
                            ? "text-amber-700"
                            : ""
                      }`}
                    >
                      {r.value != null ? `${r.value} ${r.meter.unit}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">
                      {r.warnAt ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">
                      {r.criticalAt ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        {r.critical ? (
                          <Badge tone="red">critical</Badge>
                        ) : r.warn ? (
                          <Badge tone="amber">warning</Badge>
                        ) : (
                          <Badge tone="green">ok</Badge>
                        )}
                        {!r.meter.isActive ? (
                          <Badge tone="gray">inactive</Badge>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap text-gray-600">
                      {r.meter.currentReadingAt
                        ? formatDateTime(r.meter.currentReadingAt, org.timezone)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </ListLayout>
  );
}
