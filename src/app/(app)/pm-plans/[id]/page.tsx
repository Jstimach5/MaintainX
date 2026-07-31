import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { getPlan, planHistory, previewPlan } from "@/server/services/pm";
import { getOrgSettings } from "@/server/services/org";
import { formatDate, formatDateTime } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { PlanForm } from "../plan-form";
import { buildPlanFormData } from "../picker";
import { WoStatusBadge } from "@/components/wo-badges";

export const metadata = { title: "PM plan" };

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("admin", "manager");
  const { id } = await params;
  const planId = Number(id);
  if (!Number.isInteger(planId)) notFound();
  const plan = await getPlan(planId);
  if (!plan) notFound();
  const [data, history, org] = await Promise.all([
    buildPlanFormData(),
    planHistory(planId),
    getOrgSettings(),
  ]);
  const upcoming = previewPlan(plan, 6);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title={plan.name} subtitle={`PM plan · ${plan.basis} schedule`} />
      <Card>
        <h2 className="mb-2 font-semibold">Upcoming (projected)</h2>
        <div className="flex flex-wrap gap-2">
          {upcoming.map((d, i) => (
            <span
              key={d}
              className={`rounded-full px-3 py-1 text-sm ${i === 0 ? "bg-brand-100 font-semibold text-brand-900" : "bg-gray-100 text-gray-600"}`}
            >
              {formatDate(d, org.timezone)}
            </span>
          ))}
        </div>
        {plan.basis === "floating" ? (
          <p className="mt-2 text-xs text-gray-500">
            Floating schedule — later dates shift when work is completed early
            or late.
          </p>
        ) : null}
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Generated work orders</h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing generated yet.</p>
        ) : (
          <ul className="space-y-1">
            {history.map(({ occurrence, wo }) => (
              <li key={occurrence.id} className="flex items-center justify-between gap-2 text-sm">
                {wo ? (
                  <Link
                    href={`/work-orders/${wo.id}`}
                    className="text-brand-800 hover:underline"
                  >
                    {wo.woNumber} · due {formatDate(occurrence.occurrenceKey, org.timezone)}
                  </Link>
                ) : (
                  <span className="text-gray-500">
                    pending · {occurrence.occurrenceKey}
                  </span>
                )}
                <span className="flex items-center gap-2">
                  {wo ? <WoStatusBadge status={wo.status} /> : null}
                  <span className="text-xs text-gray-500">
                    {formatDateTime(occurrence.createdAt, org.timezone)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Edit plan</h2>
        <PlanForm
          data={data}
          plan={{
            id: plan.id,
            name: plan.name,
            description: plan.description,
            siteId: plan.siteId,
            locationId: plan.locationId,
            assetId: plan.assetId,
            assignedTeamId: plan.assignedTeamId,
            assigneeIds: plan.assigneeIds,
            procedureTemplateId: plan.procedureTemplateId,
            priority: plan.priority,
            estimatedMinutes: plan.estimatedMinutes,
            plannedDowntimeMinutes: plan.plannedDowntimeMinutes,
            basis: plan.basis,
            recurUnit: plan.recurUnit,
            recurInterval: plan.recurInterval,
            leadDays: plan.leadDays,
            startDate: plan.startDate,
            endDate: plan.endDate,
            nextDue: plan.nextDue,
            isPaused: plan.isPaused,
          }}
        />
      </Card>
    </div>
  );
}
