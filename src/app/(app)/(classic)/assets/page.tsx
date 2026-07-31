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
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";
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
  const [rows, sites] = await Promise.all([
    listAssets({
      q: params.q,
      siteId: Number.isInteger(siteId) ? siteId : undefined,
      status,
      includeArchived: params.archived === "1",
    }),
    listSites({ activeOnly: true }),
  ]);

  return (
    <div>
      <PageHeader
        title="Assets"
        subtitle={`${rows.length} shown`}
        actions={
          user.role === "admin" ? (
            <ButtonLink href="/assets/new">Add asset</ButtonLink>
          ) : undefined
        }
      />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search name, number, serial…"
          className="min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base sm:w-64"
        />
        <select
          name="site"
          defaultValue={params.site ?? ""}
          className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-base"
        >
          <option value="">All sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={params.status ?? ""}
          className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-base"
        >
          <option value="">All statuses</option>
          {ASSET_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="flex min-h-11 items-center gap-1.5 text-sm text-gray-600">
          <input
            type="checkbox"
            name="archived"
            value="1"
            defaultChecked={params.archived === "1"}
            className="h-4 w-4"
          />
          Include archived
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
        >
          Filter
        </button>
      </form>
      {rows.length === 0 ? (
        <EmptyState
          title="No assets found"
          hint="Adjust the filters, or add your first asset."
        />
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {rows.map(({ asset, siteName, locationName }) => (
            <div
              key={asset.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/assets/${asset.id}`}
                  className="font-medium text-blue-800 hover:underline"
                >
                  {asset.assetNumber} · {asset.name}
                </Link>
                <p className="text-sm text-gray-500">
                  {siteName}
                  {locationName ? ` › ${locationName}` : ""}
                  {asset.assetType ? ` · ${asset.assetType}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {asset.criticality === "critical" ? (
                  <Badge tone="red">critical</Badge>
                ) : null}
                <Badge tone={STATUS_TONES[asset.status] ?? "gray"}>
                  {assetStatusLabel(asset.status)}
                </Badge>
                {asset.archivedAt ? <Badge tone="red">archived</Badge> : null}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
