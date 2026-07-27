import { requireUser } from "@/server/auth/guards";
import { listAssets } from "@/server/services/assets";
import { Card, PageHeader } from "@/components/ui";
import { buildPickerData } from "../../assets/picker";
import { RequestForm } from "../request-forms";

export const metadata = { title: "New request" };

export default async function NewRequestPage() {
  await requireUser();
  const [picker, assetRows] = await Promise.all([
    buildPickerData(),
    listAssets({}),
  ]);
  const assetsBySite: Record<number, { id: number; label: string }[]> = {};
  for (const r of assetRows) {
    (assetsBySite[r.asset.siteId] ??= []).push({
      id: r.asset.id,
      label: `${r.asset.assetNumber} · ${r.asset.name}`,
    });
  }
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="New work request" />
      <Card>
        <RequestForm picker={picker} assetsBySite={assetsBySite} />
      </Card>
    </div>
  );
}
