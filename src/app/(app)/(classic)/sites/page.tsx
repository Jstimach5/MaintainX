import Link from "next/link";
import { requireRole } from "@/server/auth/guards";
import { listSites } from "@/server/services/sites";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Sites" };

export default async function SitesPage() {
  const user = await requireRole("admin", "manager", "technician");
  const sites = await listSites();
  return (
    <div>
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
        <Card className="divide-y divide-gray-100 p-0">
          {sites.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/sites/${s.id}`}
                  className="font-medium text-brand-800 hover:underline"
                >
                  {s.name}
                </Link>
                <p className="text-sm text-gray-500">
                  {[s.code, s.address].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              {!s.isActive ? <Badge tone="red">archived</Badge> : null}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
