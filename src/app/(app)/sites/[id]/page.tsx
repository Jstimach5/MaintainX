import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { getSite } from "@/server/services/sites";
import { getLocationTree } from "@/server/services/locations";
import { listAssets } from "@/server/services/assets";
import { Button, ButtonLink, Card, EmptyState } from "@/components/ui";
import { ConfirmSubmit } from "@/components/dialog";
import { LocationTree } from "@/components/location-tree";
import { DetailLayout } from "@/components/layout";
import { ArrowLeft } from "@/components/icons";
import Link from "next/link";
import { togglePortalAction } from "../actions";

export const metadata = { title: "Site" };

/** Total locations under a site, nesting included. */
function countNodes(nodes: { children: unknown[] }[]): number {
  return nodes.reduce(
    (n, node) =>
      n + 1 + countNodes(node.children as { children: unknown[] }[]),
    0,
  );
}

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("admin", "manager", "technician");
  const { id } = await params;
  const siteId = Number(id);
  if (!Number.isInteger(siteId)) notFound();
  const site = await getSite(siteId);
  if (!site) notFound();
  const [tree, siteAssets] = await Promise.all([
    getLocationTree(siteId),
    listAssets({ siteId }),
  ]);
  const canManage = user.role === "admin";

  return (
    <DetailLayout
      header={
        <div className="mb-4">
          <Link
            href="/sites"
            className="mb-1 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-brand-800"
          >
            <ArrowLeft aria-hidden className="h-4 w-4" />
            Sites
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold sm:text-2xl">{site.name}</h1>
              <p className="text-sm text-gray-500">
                {[site.code, site.address].filter(Boolean).join(" · ") ||
                  "No code or address recorded"}
              </p>
            </div>
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                {site.isActive ? (
                  <ButtonLink href={`/sites/${site.id}/locations/new`}>
                    Add location
                  </ButtonLink>
                ) : null}
                <ButtonLink href={`/sites/${site.id}/edit`} variant="secondary">
                  Edit site
                </ButtonLink>
              </div>
            ) : null}
          </div>
        </div>
      }
      rail={
        <>
          <Card>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-gray-900 uppercase">
              At this site
            </h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Locations</dt>
                <dd className="font-medium tabular-nums">
                  {countNodes(tree)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Assets</dt>
                <dd className="font-medium tabular-nums">
                  <Link
                    href={`/assets?site=${site.id}`}
                    className="text-brand-800 hover:underline"
                  >
                    {siteAssets.length}
                  </Link>
                </dd>
              </div>
            </dl>
          </Card>
          {canManage ? (
            <Card>
              <h2 className="mb-1 text-sm font-semibold tracking-wide text-gray-900 uppercase">
                Public request portal
              </h2>
              {site.portalToken ? (
                <div className="space-y-2 text-sm">
                  <p className="text-gray-600">
                    Anyone with this link can submit a request for this site —
                    no account needed.
                  </p>
                  <p className="rounded bg-gray-100 px-2 py-1 font-mono text-xs break-all">
                    /portal/{site.portalToken}
                  </p>
                  <form action={togglePortalAction}>
                    <input type="hidden" name="siteId" value={site.id} />
                    <input type="hidden" name="enable" value="false" />
                    <ConfirmSubmit
                      label="Disable portal"
                      title="Disable the public request portal?"
                      body="The existing link stops working immediately. Anyone using a printed QR code of it will need the new link if you re-enable the portal later."
                      variant="secondary"
                    />
                  </form>
                </div>
              ) : (
                <form action={togglePortalAction} className="space-y-2">
                  <input type="hidden" name="siteId" value={site.id} />
                  <input type="hidden" name="enable" value="true" />
                  <p className="text-sm text-gray-600">
                    Let people submit requests without an account.
                  </p>
                  <Button type="submit" variant="secondary">
                    Enable public request portal
                  </Button>
                </form>
              )}
            </Card>
          ) : null}
        </>
      }
    >
      {!site.isActive ? (
        <Card className="border-red-200 bg-red-50">
          <p className="text-sm text-red-800">
            This site is archived. It no longer appears in pickers; history
            referencing it is preserved.
          </p>
        </Card>
      ) : null}
      {site.description ? (
        <Card>
          <p className="text-sm whitespace-pre-wrap">{site.description}</p>
        </Card>
      ) : null}
      <Card>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-gray-900 uppercase">
          Locations
        </h2>
        {tree.length === 0 ? (
          <EmptyState
            title="No locations yet"
            hint="Add buildings, yards, departments, rooms, or work areas — locations can nest."
            action={
              canManage && site.isActive ? (
                <ButtonLink href={`/sites/${site.id}/locations/new`}>
                  Add location
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <LocationTree nodes={tree} siteId={site.id} canManage={canManage} />
        )}
      </Card>
    </DetailLayout>
  );
}
