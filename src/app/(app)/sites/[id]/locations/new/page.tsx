import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { getSite } from "@/server/services/sites";
import { listLocationOptions } from "@/server/services/locations";
import { Card, PageHeader } from "@/components/ui";
import { LocationForm } from "../../../site-forms";

export const metadata = { title: "Add location" };

export default async function NewLocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ parent?: string }>;
}) {
  await requireRole("admin");
  const { id } = await params;
  const { parent } = await searchParams;
  const siteId = Number(id);
  if (!Number.isInteger(siteId)) notFound();
  const site = await getSite(siteId);
  if (!site) notFound();
  const options = await listLocationOptions(siteId);
  const parentId = parent != null && Number.isInteger(Number(parent)) ? Number(parent) : null;

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={`Add location in ${site.name}`} />
      <Card>
        <LocationForm
          siteId={siteId}
          options={options}
          defaultParentId={parentId}
        />
      </Card>
    </div>
  );
}
