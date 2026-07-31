import Link from "next/link";
import { requireRole } from "@/server/auth/guards";
import { listTeams } from "@/server/services/teams";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Teams" };

export default async function TeamsPage() {
  await requireRole("admin");
  const teams = await listTeams();
  return (
    <div>
      <PageHeader
        title="Teams"
        subtitle="Work orders and requests can be routed to a team."
        actions={<ButtonLink href="/admin/teams/new">Add team</ButtonLink>}
      />
      {teams.length === 0 ? (
        <EmptyState
          title="No teams yet"
          hint="Create a team to group technicians for assignment and routing."
        />
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {teams.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/teams/${t.id}`}
                  className="font-medium text-blue-800 hover:underline"
                >
                  {t.name}
                </Link>
                <p className="text-sm text-gray-500">
                  {t.members.length} member{t.members.length === 1 ? "" : "s"}
                  {t.description ? ` · ${t.description}` : ""}
                </p>
              </div>
              {!t.isActive ? <Badge tone="red">inactive</Badge> : null}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
