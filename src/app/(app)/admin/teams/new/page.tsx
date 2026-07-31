import { requireRole } from "@/server/auth/guards";
import { Card, PageHeader } from "@/components/ui";
import { CreateTeamForm } from "../team-forms";

export const metadata = { title: "Add team" };

export default async function NewTeamPage() {
  await requireRole("admin");
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Add team" />
      <Card>
        <CreateTeamForm />
      </Card>
    </div>
  );
}
