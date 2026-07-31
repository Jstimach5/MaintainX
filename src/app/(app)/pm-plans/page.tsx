import Link from "next/link";
import { requireRole } from "@/server/auth/guards";
import { listPlans } from "@/server/services/pm";
import { getOrgSettings } from "@/server/services/org";
import { todayInTimezone, formatDate } from "@/lib/format";
import { Badge, Button, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { ListLayout } from "@/components/layout";
import { runSchedulerAction } from "./actions";

export const metadata = { title: "Preventive maintenance" };

export default async function PmPlansPage() {
  await requireRole("admin", "manager");
  const plans = await listPlans();
  const org = await getOrgSettings();
  const today = todayInTimezone(org.timezone);

  return (
    <ListLayout>
      <PageHeader
        title="Preventive maintenance"
        subtitle="Plans that generate work orders automatically. The background worker runs hourly; Run now forces a pass."
        actions={
          <>
            <form action={runSchedulerAction}>
              <Button type="submit" variant="secondary">
                Run scheduler now
              </Button>
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
        <>
          <Card className="divide-y divide-gray-100 p-0 md:hidden">
            {plans.map(({ plan, siteName, assetName, assetNumber }) => {
              const overdue = !plan.isPaused && plan.nextDue < today;
              return (
                <Link
                  key={plan.id}
                  href={`/pm-plans/${plan.id}`}
                  className="block px-4 py-3 active:bg-gray-50"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 font-medium text-brand-800">
                      {plan.name}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {plan.isPaused ? <Badge tone="gray">paused</Badge> : null}
                      {overdue ? <Badge tone="red">overdue</Badge> : null}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-sm text-gray-500">
                    {siteName}
                    {assetName ? ` · ${assetNumber} ${assetName}` : ""}
                    {" · next due "}
                    <span className={overdue ? "font-semibold text-red-700" : ""}>
                      {formatDate(plan.nextDue, org.timezone)}
                    </span>
                  </span>
                </Link>
              );
            })}
          </Card>

          <Card className="hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs tracking-wide text-gray-500 uppercase">
                  <th className="px-4 py-2.5 font-semibold">Plan</th>
                  <th className="px-3 py-2.5 font-semibold">Site / asset</th>
                  <th className="px-3 py-2.5 font-semibold">Every</th>
                  <th className="px-3 py-2.5 font-semibold">Basis</th>
                  <th className="px-3 py-2.5 font-semibold">State</th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    Next due
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {plans.map(({ plan, siteName, assetName, assetNumber }) => {
                  const overdue = !plan.isPaused && plan.nextDue < today;
                  return (
                    <tr key={plan.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/pm-plans/${plan.id}`}
                          className="font-medium text-brand-800 hover:underline"
                        >
                          {plan.name}
                        </Link>
                      </td>
                      <td className="max-w-64 truncate px-3 py-2.5 text-gray-600">
                        {siteName}
                        {assetName ? ` · ${assetNumber} ${assetName}` : ""}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">
                        {plan.recurInterval} {plan.recurUnit}
                        {plan.recurInterval > 1 ? "s" : ""}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{plan.basis}</td>
                      <td className="px-3 py-2.5">
                        {plan.isPaused ? (
                          <Badge tone="gray">paused</Badge>
                        ) : overdue ? (
                          <Badge tone="red">overdue</Badge>
                        ) : (
                          <Badge tone="green">scheduled</Badge>
                        )}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right whitespace-nowrap ${
                          overdue ? "font-semibold text-red-700" : "text-gray-600"
                        }`}
                      >
                        {formatDate(plan.nextDue, org.timezone)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </ListLayout>
  );
}
