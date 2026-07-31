import Link from "next/link";
import { requireRole } from "@/server/auth/guards";
import { listSites } from "@/server/services/sites";
import { listLocationsBySite } from "@/server/services/locations";
import { listAssets } from "@/server/services/assets";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { ListLayout } from "@/components/layout";

export const metadata = { title: "Sites" };

export default async function SitesPage() {
  const user = await requireRole("admin", "manager", "technician");
  const [sites, locationGroups, assetRows] = await Promise.all([
    listSites(),
    listLocationsBySite(),
    listAssets({}),
  ]);
  const locationCount = new Map(
    locationGroups.map((g) => [g.site.id, g.count]),
  );
  const assetCount = new Map<number, number>();
  for (const { asset } of assetRows) {
    assetCount.set(asset.siteId, (assetCount.get(asset.siteId) ?? 0) + 1);
  }

  return (
    <ListLayout>
      <PageHeader
        title="Sites"
        subtitle="Physical sites; each contains its own location tree."
        actions={
          user.role === "admin" ? (
            <ButtonLink href="/sites/new">Add site</ButtonLink>
          ) : undefined
        }
      />
      {sites.length === 0 ? (
        <EmptyState
          title="No sites yet"
          hint="Create your first site — locations, assets, and work orders all hang off a site."
          action={
            user.role === "admin" ? (
              <ButtonLink href="/sites/new">Add site</ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs tracking-wide text-gray-500 uppercase">
                <th className="px-4 py-2.5 font-semibold">Site</th>
                <th className="px-3 py-2.5 font-semibold">Code</th>
                <th className="px-3 py-2.5 font-semibold">Address</th>
                <th className="px-3 py-2.5 text-right font-semibold">
                  Locations
                </th>
                <th className="px-3 py-2.5 text-right font-semibold">Assets</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sites.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/sites/${s.id}`}
                      className="font-medium text-brand-800 hover:underline"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{s.code ?? "—"}</td>
                  <td className="max-w-72 truncate px-3 py-2.5 text-gray-600">
                    {s.address ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">
                    {locationCount.get(s.id) ?? 0}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">
                    {assetCount.get(s.id) ?? 0}
                  </td>
                  <td className="px-4 py-2.5">
                    {s.isActive ? (
                      <Badge tone="green">active</Badge>
                    ) : (
                      <Badge tone="red">archived</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </ListLayout>
  );
}
