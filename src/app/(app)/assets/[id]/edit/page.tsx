import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { getAsset } from "@/server/services/assets";
import { Card, PageHeader } from "@/components/ui";
import { AssetForm } from "../../asset-forms";
import { buildAssetFormData } from "../../picker";

export const metadata = { title: "Edit asset" };

export default async function EditAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("admin");
  const { id } = await params;
  const assetId = Number(id);
  if (!Number.isInteger(assetId)) notFound();
  const asset = await getAsset(assetId);
  if (!asset) notFound();
  const { picker, parentOptions, teams, people } = await buildAssetFormData();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`Edit: ${asset.assetNumber} · ${asset.name}`} />
      <Card>
        <AssetForm
          picker={picker}
          asset={{
            id: asset.id,
            assetNumber: asset.assetNumber,
            name: asset.name,
            description: asset.description,
            assetType: asset.assetType,
            siteId: asset.siteId,
            locationId: asset.locationId,
            parentAssetId: asset.parentAssetId,
            make: asset.make,
            model: asset.model,
            serialNumber: asset.serialNumber,
            year: asset.year,
            purchaseDate: asset.purchaseDate,
            inServiceDate: asset.inServiceDate,
            warrantyInfo: asset.warrantyInfo,
            criticality: asset.criticality,
            responsibleTeamId: asset.responsibleTeamId,
            responsibleUserId: asset.responsibleUserId,
            notes: asset.notes,
            tags: asset.tags,
          }}
          parentOptions={parentOptions}
          teams={teams}
          people={people}
        />
      </Card>
    </div>
  );
}
