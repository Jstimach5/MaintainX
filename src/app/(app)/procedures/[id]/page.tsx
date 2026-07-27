import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import {
  getTemplate,
  getTemplateVersion,
  type ProcedureStep,
} from "@/server/services/procedures";
import { Card, PageHeader } from "@/components/ui";
import { ProcedureBuilder } from "../step-builder";

export const metadata = { title: "Edit procedure" };

export default async function EditProcedurePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("admin", "manager");
  const { id } = await params;
  const templateId = Number(id);
  if (!Number.isInteger(templateId)) notFound();
  const template = await getTemplate(templateId);
  if (!template) notFound();
  const version = await getTemplateVersion(templateId, template.currentVersion);
  if (!version) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={`Edit: ${template.name}`}
        subtitle={`Current version v${template.currentVersion} — saving creates v${template.currentVersion + 1}`}
      />
      <Card>
        <ProcedureBuilder
          template={{
            id: template.id,
            name: template.name,
            description: template.description,
            isActive: template.isActive,
            steps: version.steps as ProcedureStep[],
          }}
        />
      </Card>
    </div>
  );
}
