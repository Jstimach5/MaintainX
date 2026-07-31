import Link from "next/link";
import { requireRole } from "@/server/auth/guards";
import {
  ASSET_STATUSES,
  assetStatusLabel,
  listAssets,
  type AssetStatusValue,
} from "@/server/services/assets";
import { listSites } from "@/server/services/sites";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
} from "@/components/ui";
import { ListLayout } from "@/components/layout";
import { AssetThumb } from "@/components/asset-thumb";
import { listMainImages } from "@/server/services/attachments";
import { FilterToolbar } from "@/components/filter-toolbar";
import type { BadgeTone } from "@/components/ui";

export const metadata = { title: "Assets" };

const STATUS_TONES: Record<string, BadgeTone> = Object.fromEntries(
  ASSET_STATUSES.map((s) => [s.value, s.tone]),
);

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    site?: string;
    status?: string;
    archived?: string;
  }>;
}) {
  const user = await requireRole("admin", "manager", "technician");
  const params = await searchParams;
  const siteId = params.site ? Number(params.site) : undefined;
  const status = ASSET_STATUSES.some((s) => s.value === params.status)
    ? (params.status as AssetStatusValue)
    : undefined;
  const [rowsRaw, sites] = await Promise.all([
    listAssets({
      q: params.q,
      siteId: Number.isInteger(siteId) ? siteId : undefined,
      status,
      includeArchived: params.archived === "1",
    }),
    listSites({ activeOnly: true }),
  ]);
  const rows = rowsRaw;
  // One query for the page's thumbnails, not one per row.
  const photos = await listMainImages(
    "asset",
    rows.map((r) => r.asset.id),
  );

  return (
    <ListLayout>
      <PageHeader
        title="Assets"
        subtitle={`${rows.length} shown`}
        actions={
          user.role === "admin" ? (
            <ButtonLink href="/assets/new">Add asset</ButtonLink>
          ) : undefined
        }
      />
      <FilterToolbar activeCount={[params.q, params.site, params.status, params.archived].filter(Boolean).length}>
        <Input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search name, number, serial…"
          aria-label="Search assets"
          inline
          className="w-full sm:w-64"
        />
        <Select name="site" defaultValue={params.site ?? ""} inline aria-label="Site">
          <option value="">All sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={params.status ?? ""} inline aria-label="Status">
          <option value="">All statuses</option>
          {ASSET_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <label className="flex min-h-11 items-center gap-1.5 text-sm text-gray-600">
          <input
            type="checkbox"
            name="archived"
            value="1"
            defaultChecked={params.archived === "1"}
            className="h-4 w-4 accent-brand-800"
          />
          Include archived
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </FilterToolbar>
      {rows.length === 0 ? (
        <EmptyState
          title="No assets found"
          hint="Adjust the filters, or add your first asset."
        />
      ) : (
        <>
          {/* Phones: record cards. */}
          <Card className="divide-y divide-gray-100 p-0 md:hidden">
            {rows.map(({ asset, siteName, locationName }) => (
              <Link
                key={asset.id}
                href={`/assets/${asset.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 active:bg-gray-50"
              >
                <span className="flex min-w-0 items-start gap-3">
                  <AssetThumb
                    attachmentId={photos.get(asset.id)}
                    assetType={asset.assetType}
                  />
                  <span className="min-w-0">
                  <span className="block font-medium text-brand-800">
                    {asset.assetNumber} · {asset.name}
                  </span>
                  <span className="block text-sm text-gray-500">
                    {siteName}
                    {locationName ? ` › ${locationName}` : ""}
                    {asset.assetType ? ` · ${asset.assetType}` : ""}
                  </span>
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {asset.criticality === "critical" ? (
                    <Badge tone="red">critical</Badge>
                  ) : null}
                  <Badge tone={STATUS_TONES[asset.status] ?? "gray"}>
                    {assetStatusLabel(asset.status)}
                  </Badge>
                  {asset.archivedAt ? <Badge tone="red">archived</Badge> : null}
                </span>
              </Link>
            ))}
          </Card>
          {/* Desktop: table with the important columns visible. */}
          <Card className="hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs tracking-wide text-gray-500 uppercase">
                  <th className="px-4 py-2.5 font-semibold">Asset</th>
                  <th className="px-3 py-2.5 font-semibold">Type</th>
                  <th className="px-3 py-2.5 font-semibold">Site / location</th>
                  <th className="px-3 py-2.5 font-semibold">Criticality</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(({ asset, siteName, locationName }) => (
                  <tr key={asset.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <AssetThumb
                          attachmentId={photos.get(asset.id)}
                          assetType={asset.assetType}
                          className="h-8 w-8"
                        />
                        <Link
                          href={`/assets/${asset.id}`}
                          className="font-medium text-brand-800 hover:underline"
                        >
                          {asset.assetNumber} · {asset.name}
                        </Link>
                      </span>
                    </td>
                    <td className="max-w-40 truncate px-3 py-2.5 text-gray-600">
                      {asset.assetType ?? "—"}
                    </td>
                    <td className="max-w-56 truncate px-3 py-2.5 text-gray-600">
                      {siteName}
                      {locationName ? ` › ${locationName}` : ""}
                    </td>
                    <td className="px-3 py-2.5">
                      {asset.criticality === "critical" ? (
                        <Badge tone="red">critical</Badge>
                      ) : asset.criticality === "high" ? (
                        <Badge tone="amber">high</Badge>
                      ) : (
                        <span className="text-gray-500">{asset.criticality}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <Badge tone={STATUS_TONES[asset.status] ?? "gray"}>
                          {assetStatusLabel(asset.status)}
                        </Badge>
                        {asset.archivedAt ? (
                          <Badge tone="red">archived</Badge>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

        </>
      )}
    </ListLayout>
  );
}
