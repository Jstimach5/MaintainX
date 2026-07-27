import { requireRole } from "@/server/auth/guards";
import { Card, PageHeader } from "@/components/ui";
import { AssetForm } from "../asset-forms";
import { buildAssetFormData } from "../picker";

export const metadata = { title: "Add asset" };

export default async function NewAssetPage() {
  await requireRole("admin");
  const { picker, parentOptions, teams, people } = await buildAssetFormData();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add asset" />
      <Card>
        <AssetForm
          picker={picker}
          parentOptions={parentOptions}
          teams={teams}
          people={people}
        />
      </Card>
    </div>
  );
}
