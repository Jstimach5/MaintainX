import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { getSite } from "@/server/services/sites";
import { getLocationTree } from "@/server/services/locations";
import {
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { LocationTree } from "@/components/location-tree";
import { togglePortalAction } from "../actions";

export const metadata = { title: "Site" };

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
  const tree = await getLocationTree(siteId);
  const canManage = user.role === "admin";

  return (
    <div className="space-y-4">
      <PageHeader
        title={site.name}
        subtitle={[site.code, site.address].filter(Boolean).join(" · ")}
        actions={
          canManage ? (
            <>
              <ButtonLink href={`/sites/${site.id}/edit`} variant="secondary">
                Edit site
              </ButtonLink>
              {site.isActive ? (
                <ButtonLink href={`/sites/${site.id}/locations/new`}>
                  Add location
                </ButtonLink>
              ) : null}
            </>
          ) : undefined
        }
      />
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
      {canManage ? (
        <Card>
          <h2 className="mb-1 font-semibold">Public request portal</h2>
          {site.portalToken ? (
            <div className="space-y-2 text-sm">
              <p>
                Anyone with this link can submit a maintenance request for this
                site — no account needed. Post it or print a QR of it where
                people work:
              </p>
              <p className="break-all rounded bg-gray-100 px-2 py-1 font-mono text-xs">
                /portal/{site.portalToken}
              </p>
              <form action={togglePortalAction}>
                <input type="hidden" name="siteId" value={site.id} />
                <input type="hidden" name="enable" value="false" />
                <button
                  type="submit"
                  className="text-sm text-red-700 hover:underline"
                >
                  Disable portal (invalidates the link)
                </button>
              </form>
            </div>
          ) : (
            <form action={togglePortalAction}>
              <input type="hidden" name="siteId" value={site.id} />
              <input type="hidden" name="enable" value="true" />
              <button
                type="submit"
                className="text-sm font-medium text-blue-700 hover:underline"
              >
                Enable public request portal
              </button>
            </form>
          )}
        </Card>
      ) : null}
      <Card>
        <h2 className="mb-2 font-semibold">Locations</h2>
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
    </div>
  );
}
