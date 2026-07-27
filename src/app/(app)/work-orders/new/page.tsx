import { requireRole } from "@/server/auth/guards";
import { getAsset } from "@/server/services/assets";
import { Card, PageHeader } from "@/components/ui";
import { WorkOrderForm } from "../wo-forms";
import { buildWoFormData } from "../picker";

export const metadata = { title: "New work order" };

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string }>;
}) {
  await requireRole("admin", "manager");
  const data = await buildWoFormData();
  const { asset: assetParam } = await searchParams;
  // "New work order" from an asset page prefills site + asset.
  let defaults: { siteId?: number; assetIds?: number[] } | undefined;
  if (assetParam && Number.isInteger(Number(assetParam))) {
    const asset = await getAsset(Number(assetParam));
    if (asset && !asset.archivedAt) {
      defaults = { siteId: asset.siteId, assetIds: [asset.id] };
    }
  }
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New work order" />
      <Card>
        <WorkOrderForm data={data} defaults={defaults} />
      </Card>
    </div>
  );
}
