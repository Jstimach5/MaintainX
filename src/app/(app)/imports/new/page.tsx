import { requireRole } from "@/server/auth/guards";
import { Card, PageHeader } from "@/components/ui";
import { UploadForm } from "../import-forms";

export const metadata = { title: "New import" };

export default async function NewImportPage() {
  await requireRole("admin");
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="New import"
        subtitle="Step 1 of 3 — upload the file. You'll map columns and preview before anything is written."
      />
      <Card>
        <UploadForm />
      </Card>
      <p className="mt-3 text-xs text-gray-500">
        Template columns (all optional except Title): External ID, Title,
        Description, Status, Priority, Work type, Site, Location, Asset,
        Assigned user, Assigned team, Requester, Created date, Planned start,
        Due date, Completion date, Estimated minutes, Actual minutes, Planned
        downtime, Actual downtime, Tags, Completion notes.
      </p>
    </div>
  );
}
