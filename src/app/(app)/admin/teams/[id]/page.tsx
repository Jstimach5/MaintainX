import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { listTeams } from "@/server/services/teams";
import { listUsers } from "@/server/services/users";
import { Card, PageHeader } from "@/components/ui";
import { EditTeamForm } from "../team-forms";

export const metadata = { title: "Edit team" };

export default async function EditTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("admin");
  const { id } = await params;
  const teamId = Number(id);
  if (!Number.isInteger(teamId)) notFound();
  const teams = await listTeams();
  const team = teams.find((t) => t.id === teamId);
  if (!team) notFound();
  const allUsers = await listUsers();

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={`Edit team: ${team.name}`} />
      <Card>
        <EditTeamForm
          team={{
            id: team.id,
            name: team.name,
            description: team.description,
            isActive: team.isActive,
            memberIds: team.members.map((m) => m.userId),
          }}
          allUsers={allUsers.map((u) => ({
            id: u.id,
            displayName: u.displayName,
            role: u.role,
            isActive: u.isActive,
          }))}
        />
      </Card>
    </div>
  );
}
