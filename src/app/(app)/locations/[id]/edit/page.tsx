import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { getSite } from "@/server/services/sites";
import {
  getLocation,
  listLocationOptions,
} from "@/server/services/locations";
import { Card, PageHeader } from "@/components/ui";
import { LocationForm } from "../../../sites/site-forms";

export const metadata = { title: "Edit location" };

export default async function EditLocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("admin");
  const { id } = await params;
  const locationId = Number(id);
  if (!Number.isInteger(locationId)) notFound();
  const location = await getLocation(locationId);
  if (!location) notFound();
  const site = await getSite(location.siteId);
  if (!site) notFound();
  const options = await listLocationOptions(location.siteId);

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title={`Edit location: ${location.name}`}
        subtitle={`Site: ${site.name}`}
      />
      <Card>
        <LocationForm siteId={site.id} options={options} location={location} />
      </Card>
      <p className="mt-3 text-sm">
        <Link href={`/sites/${site.id}`} className="text-brand-800 hover:underline">
          ← Back to {site.name}
        </Link>
      </p>
    </div>
  );
}
