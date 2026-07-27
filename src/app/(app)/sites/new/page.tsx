import { requireRole } from "@/server/auth/guards";
import { Card, PageHeader } from "@/components/ui";
import { SiteForm } from "../site-forms";

export const metadata = { title: "Add site" };

export default async function NewSitePage() {
  await requireRole("admin");
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Add site" />
      <Card>
        <SiteForm />
      </Card>
    </div>
  );
}
