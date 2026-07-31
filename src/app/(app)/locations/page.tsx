import Link from "next/link";
import { requireRole } from "@/server/auth/guards";
import { listLocationsBySite } from "@/server/services/locations";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { ListLayout } from "@/components/layout";
import { LocationTree } from "@/components/location-tree";
import { MapPin } from "@/components/icons";

export const metadata = { title: "Locations" };

export default async function LocationsPage() {
  const user = await requireRole("admin", "manager", "technician");
  const groups = await listLocationsBySite();
  const isAdmin = user.role === "admin";
  const total = groups.reduce((n, g) => n + g.count, 0);

  return (
    <ListLayout>
      <PageHeader
        title="Locations"
        subtitle={`${total} across ${groups.length} site${groups.length === 1 ? "" : "s"} — locations nest under a site`}
        actions={
          isAdmin && groups.length > 0 ? (
            <ButtonLink href="/sites">Manage sites</ButtonLink>
          ) : undefined
        }
      />
      {groups.length === 0 ? (
        <EmptyState
          title="No sites yet"
          hint="Locations live under a site — create a site first."
          action={
            isAdmin ? (
              <ButtonLink href="/sites/new" variant="secondary">
                Add site
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {groups.map(({ site, tree, count }) => (
            <Card key={site.id}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex min-w-0 items-center gap-1.5">
                  <MapPin aria-hidden className="h-4 w-4 shrink-0 text-brand-700" />
                  <Link
                    href={`/sites/${site.id}`}
                    className="truncate font-semibold text-brand-800 hover:underline"
                  >
                    {site.name}
                  </Link>
                  {!site.isActive ? <Badge tone="red">archived</Badge> : null}
                </h2>
                <span className="text-xs text-gray-500">
                  {count} location{count === 1 ? "" : "s"}
                </span>
              </div>
              {count === 0 ? (
                <p className="text-sm text-gray-500">
                  No locations recorded for this site yet.
                </p>
              ) : (
                <LocationTree
                  nodes={tree}
                  siteId={site.id}
                  canManage={isAdmin}
                />
              )}
              {isAdmin && site.isActive ? (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <ButtonLink
                    href={`/sites/${site.id}/locations/new`}
                    variant="secondary"
                  >
                    Add location
                  </ButtonLink>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </ListLayout>
  );
}
