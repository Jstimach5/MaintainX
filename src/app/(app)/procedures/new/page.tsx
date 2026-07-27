import { requireRole } from "@/server/auth/guards";
import { Card, PageHeader } from "@/components/ui";
import { ProcedureBuilder } from "../step-builder";

export const metadata = { title: "New procedure" };

export default async function NewProcedurePage() {
  await requireRole("admin", "manager");
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New procedure" />
      <Card>
        <ProcedureBuilder />
      </Card>
    </div>
  );
}
