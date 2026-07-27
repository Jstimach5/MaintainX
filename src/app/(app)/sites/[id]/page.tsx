import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { getSite } from "@/server/services/sites";
import {
  getLocationTree,
  type LocationNode,
} from "@/server/services/locations";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";

export const metadata = { title: "Site" };

function LocationTree({
  nodes,
  siteId,
  canManage,
  depth = 0,
}: {
  nodes: LocationNode[];
  siteId: number;
  canManage: boolean;
  depth?: number;
}) {
  if (nodes.length === 0) return null;
  return (
    <ul className={depth > 0 ? "ml-4 border-l border-gray-200 pl-3" : ""}>
      {nodes.map((n) => (
        <li key={n.id} className="py-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={n.isActive ? "font-medium" : "font-medium text-gray-400"}>
              {n.name}
            </span>
            {n.code ? (
              <span className="text-xs text-gray-400">{n.code}</span>
            ) : null}
            {!n.isActive ? <Badge tone="red">archived</Badge> : null}
            {canManage ? (
              <span className="flex gap-2 text-xs">
                <Link
                  href={`/locations/${n.id}/edit`}
                  className="text-blue-700 hover:underline"
                >
                  Edit
                </Link>
                {n.isActive ? (
                  <Link
                    href={`/sites/${siteId}/locations/new?parent=${n.id}`}
                    className="text-blue-700 hover:underline"
                  >
                    + Sub-location
                  </Link>
                ) : null}
              </span>
            ) : null}
          </div>
          <LocationTree
            nodes={n.children}
            siteId={siteId}
            canManage={canManage}
            depth={depth + 1}
          />
        </li>
      ))}
    </ul>
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
