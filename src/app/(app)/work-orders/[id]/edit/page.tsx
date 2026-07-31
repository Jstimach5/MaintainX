import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { getWorkOrderDetail } from "@/server/services/workOrders";
import { getOrgSettings } from "@/server/services/org";
import { Card, PageHeader } from "@/components/ui";
import { WorkOrderForm } from "../../wo-forms";
import { buildWoFormData } from "../../picker";

export const metadata = { title: "Edit work order" };

/** Convert a stored UTC timestamp to a datetime-local value in org time. */
function toLocalInput(d: Date | null, timeZone: string): string | null {
  if (!d) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export default async function EditWorkOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("admin", "manager");
  const { id } = await params;
  const woId = Number(id);
  if (!Number.isInteger(woId)) notFound();
  const detail = await getWorkOrderDetail(woId);
  if (!detail) notFound();
  const org = await getOrgSettings();
  const data = await buildWoFormData();
  const { wo } = detail;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`Edit ${wo.woNumber}`} />
      <Card>
        <WorkOrderForm
          data={data}
          wo={{
            id: wo.id,
            title: wo.title,
            description: wo.description,
            siteId: wo.siteId,
            locationId: wo.locationId,
            parentWorkOrderId: wo.parentWorkOrderId,
            workType: wo.workType,
            priority: wo.priority,
            assignedTeamId: wo.assignedTeamId,
            requesterId: wo.requesterId,
            plannedStartAt: toLocalInput(wo.plannedStartAt, org.timezone),
            dueAt: toLocalInput(wo.dueAt, org.timezone),
            estimatedMinutes: wo.estimatedMinutes,
            plannedDowntimeMinutes: wo.plannedDowntimeMinutes,
            tags: wo.tags,
            assetIds: detail.assets.map((a) => a.asset.id),
            assigneeIds: detail.assignments.map((a) => a.userId),
          }}
        />
      </Card>
    </div>
  );
}
