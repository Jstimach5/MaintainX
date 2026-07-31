import Link from "next/link";
import { requireUser } from "@/server/auth/guards";
import { listAssets } from "@/server/services/assets";
import { Card, Input, PageHeader } from "@/components/ui";

export const metadata = { title: "Find an asset" };
export const dynamic = "force-dynamic";

/**
 * Asset lookup for the field. Scanning a printed label with the phone's
 * camera already opens /a/<token>; this screen covers the other half —
 * finding the machine when the label is missing, unreadable, or the
 * technician is not standing next to it. The in-app camera scanner lands
 * in M3 and will sit above this search.
 */
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const rows = q ? await listAssets({ q, includeArchived: false }) : [];
  const canSeeAssets = user.role !== "requester";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Find an asset"
        subtitle="Scan the QR label on the machine, or search for it here."
      />

      <Card>
        <p className="mb-3 text-sm text-gray-600">
          <strong>To scan:</strong> open your phone&apos;s camera and point it
          at the QR label on the equipment, then tap the link that appears.
        </p>
        <form method="get" className="flex gap-2">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Asset number, name, model, serial…"
            aria-label="Search assets"
            autoComplete="off"
            className="flex-1"
          />
          <button
            type="submit"
            className="min-h-11 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white active:bg-blue-800"
          >
            Search
          </button>
        </form>
      </Card>

      {q ? (
        <Card>
          <h2 className="mb-2 font-semibold">
            {rows.length} result{rows.length === 1 ? "" : "s"} for “{q}”
          </h2>
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nothing matched. Try the asset number from the label.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {rows.slice(0, 25).map(({ asset, siteName, locationName }) => (
                <li key={asset.id}>
                  <Link
                    href={
                      canSeeAssets
                        ? `/assets/${asset.id}`
                        : `/requests/new?assetId=${asset.id}`
                    }
                    className="-mx-2 block rounded px-2 py-3 active:bg-gray-50"
                  >
                    <span className="block font-medium text-blue-800">
                      {asset.assetNumber} · {asset.name}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {[siteName, locationName].filter(Boolean).join(" › ") ||
                        "No location"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}
