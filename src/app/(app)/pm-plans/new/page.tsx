import { requireRole } from "@/server/auth/guards";
import { Card, PageHeader } from "@/components/ui";
import { PlanForm } from "../plan-form";
import { buildPlanFormData } from "../picker";

export const metadata = { title: "New PM plan" };

export default async function NewPlanPage() {
  await requireRole("admin", "manager");
  const data = await buildPlanFormData();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New preventive maintenance plan" />
      <Card>
        <PlanForm data={data} />
      </Card>
    </div>
  );
}
