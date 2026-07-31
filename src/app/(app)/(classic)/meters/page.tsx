import Link from "next/link";
import { requireRole } from "@/server/auth/guards";
import { listMeters } from "@/server/services/meters";
import { getOrgSettings } from "@/server/services/org";
import { formatDateTime } from "@/lib/format";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Meters" };

export default async function MetersPage() {
  const user = await requireRole("admin", "manager", "technician");
  const rows = await listMeters();
  const org = await getOrgSettings();
  const canManage = user.role !== "technician";

  return (
    <div>
      <PageHeader
        title="Meters"
        subtitle="Hours, miles, cycles, temperatures — with triggers that generate work automatically."
        actions={
          canManage ? <ButtonLink href="/meters/new">Add meter</ButtonLink> : undefined
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No meters yet"
          hint="Add a meter like 'Generator run hours' and set a service trigger."
        />
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {rows.map(({ meter, assetName, assetNumber, locationName }) => {
            const value = meter.currentValue != null ? Number(meter.currentValue) : null;
            const warn =
              value != null &&
              meter.warnThreshold != null &&
              value >= Number(meter.warnThreshold);
            const critical =
              value != null &&
              meter.criticalThreshold != null &&
              value >= Number(meter.criticalThreshold);
            return (
              <div key={meter.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <Link
                    href={`/meters/${meter.id}`}
                    className="font-medium text-brand-800 hover:underline"
                  >
                    {meter.name}
                  </Link>
                  <p className="text-sm text-gray-500">
                    {assetName ? `${assetNumber} ${assetName}` : locationName ?? "—"}
                    {meter.currentReadingAt
                      ? ` · last ${formatDateTime(meter.currentReadingAt, org.timezone)}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {critical ? (
                    <Badge tone="red">critical</Badge>
                  ) : warn ? (
                    <Badge tone="amber">warning</Badge>
                  ) : null}
                  {!meter.isActive ? <Badge tone="gray">inactive</Badge> : null}
                  <span className="text-lg font-semibold">
                    {value != null ? `${value} ${meter.unit}` : "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
