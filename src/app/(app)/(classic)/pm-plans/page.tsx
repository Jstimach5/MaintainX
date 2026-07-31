import Link from "next/link";
import { requireRole } from "@/server/auth/guards";
import { listPlans } from "@/server/services/pm";
import { getOrgSettings } from "@/server/services/org";
import { todayInTimezone, formatDate } from "@/lib/format";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { runSchedulerAction } from "./actions";

export const metadata = { title: "Preventive maintenance" };

export default async function PmPlansPage() {
  await requireRole("admin", "manager");
  const plans = await listPlans();
  const org = await getOrgSettings();
  const today = todayInTimezone(org.timezone);

  return (
    <div>
      <PageHeader
        title="Preventive maintenance"
        subtitle="Plans that generate work orders automatically. The background worker runs hourly; Run now forces a pass."
        actions={
          <>
            <form action={runSchedulerAction}>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
              >
                Run scheduler now
              </button>
            </form>
            <ButtonLink href="/pm-plans/new">New plan</ButtonLink>
          </>
        }
      />
      {plans.length === 0 ? (
        <EmptyState
          title="No PM plans yet"
          hint="Create a plan like 'Grease conveyor — every 30 days'."
          action={<ButtonLink href="/pm-plans/new">New plan</ButtonLink>}
        />
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {plans.map(({ plan, siteName, assetName, assetNumber }) => {
            const overdue = !plan.isPaused && plan.nextDue < today;
            return (
              <div key={plan.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/pm-plans/${plan.id}`}
                    className="font-medium text-blue-800 hover:underline"
                  >
                    {plan.name}
                  </Link>
                  <div className="flex items-center gap-1.5">
                    {plan.isPaused ? <Badge tone="gray">paused</Badge> : null}
                    {overdue ? <Badge tone="red">overdue</Badge> : null}
                    <Badge tone="blue">
                      every {plan.recurInterval} {plan.recurUnit}
                      {plan.recurInterval > 1 ? "s" : ""}
                    </Badge>
                    <Badge tone={plan.basis === "fixed" ? "purple" : "gray"}>
                      {plan.basis}
                    </Badge>
                  </div>
                </div>
                <p className="mt-0.5 text-sm text-gray-500">
                  {siteName}
                  {assetName ? ` · ${assetNumber} ${assetName}` : ""}
                  {" · next due "}
                  <span className={overdue ? "font-semibold text-red-600" : ""}>
                    {formatDate(plan.nextDue, org.timezone)}
                  </span>
                </p>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
