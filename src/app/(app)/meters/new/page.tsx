import { requireRole } from "@/server/auth/guards";
import { listAssets } from "@/server/services/assets";
import { listSites } from "@/server/services/sites";
import { listLocationOptions } from "@/server/services/locations";
import { Card, PageHeader } from "@/components/ui";
import { MeterForm } from "../meter-forms";

export const metadata = { title: "Add meter" };

export default async function NewMeterPage() {
  await requireRole("admin", "manager");
  const [assetRows, sites] = await Promise.all([
    listAssets({}),
    listSites({ activeOnly: true }),
  ]);
  const locations: { id: number; label: string }[] = [];
  for (const site of sites) {
    for (const o of await listLocationOptions(site.id)) {
      locations.push({ id: o.id, label: `${site.name} › ${o.label}` });
    }
  }
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Add meter" />
      <Card>
        <MeterForm
          assets={assetRows.map((r) => ({
            id: r.asset.id,
            label: `${r.asset.assetNumber} · ${r.asset.name}`,
          }))}
          locations={locations}
        />
      </Card>
    </div>
  );
}
