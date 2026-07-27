import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { getSite } from "@/server/services/sites";
import { Card, PageHeader } from "@/components/ui";
import { SiteForm } from "../../site-forms";

export const metadata = { title: "Edit site" };

export default async function EditSitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("admin");
  const { id } = await params;
  const siteId = Number(id);
  if (!Number.isInteger(siteId)) notFound();
  const site = await getSite(siteId);
  if (!site) notFound();
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={`Edit site: ${site.name}`} />
      <Card>
        <SiteForm site={site} />
      </Card>
    </div>
  );
}
