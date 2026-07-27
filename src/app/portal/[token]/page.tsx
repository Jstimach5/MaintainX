import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { sites } from "@/server/db/schema";
import { listLocationOptions } from "@/server/services/locations";
import { listAssets } from "@/server/services/assets";
import { PortalForm } from "./portal-form";

export const metadata = { title: "Submit a maintenance request" };
export const dynamic = "force-dynamic";

/**
 * Public per-site request portal (§8): no login, tokenized URL, rate-limited
 * submissions. Exposes only what the form needs — location and asset names
 * for THIS site; nothing else.
 */
export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { token } = await params;
  const { submitted } = await searchParams;
  if (!/^[a-zA-Z0-9_-]{16,64}$/.test(token)) notFound();
  const rows = await db
    .select()
    .from(sites)
    .where(eq(sites.portalToken, token))
    .limit(1);
  const site = rows[0];
  if (!site || !site.isActive) notFound();

  if (submitted) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6 text-center">
        <h1 className="text-2xl font-bold text-green-700">Request received</h1>
        <p className="mt-2 text-gray-600">
          Thanks — the maintenance team has been notified. Reference:{" "}
          <strong>{submitted}</strong>
        </p>
        <p className="mt-4 text-sm">
          <a
            href={`/portal/${token}`}
            className="text-blue-700 hover:underline"
          >
            Submit another request
          </a>
        </p>
      </main>
    );
  }

  const [locations, assetRows] = await Promise.all([
    listLocationOptions(site.id),
    listAssets({ siteId: site.id }),
  ]);

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold">Maintenance request</h1>
      <p className="mb-6 text-sm text-gray-500">{site.name}</p>
      <PortalForm
        token={token}
        locations={locations}
        assets={assetRows.map((r) => ({
          id: r.asset.id,
          label: `${r.asset.assetNumber} · ${r.asset.name}`,
        }))}
      />
    </main>
  );
}
