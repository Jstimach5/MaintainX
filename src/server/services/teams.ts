import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { teamMembers, teams, users } from "@/server/db/schema";
import { recordAudit } from "./audit";
import { ServiceError } from "./users";

export async function listTeams() {
  const allTeams = await db.select().from(teams).orderBy(asc(teams.name));
  const members = await db
    .select({
      teamId: teamMembers.teamId,
      userId: users.id,
      displayName: users.displayName,
      isActive: users.isActive,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id));
  return allTeams.map((t) => ({
    ...t,
    members: members.filter((m) => m.teamId === t.id),
  }));
}

export async function createTeam(
  actorId: number,
  input: { name: string; description?: string | null },
): Promise<number> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.name, input.name))
      .limit(1);
    if (existing.length > 0) {
      throw new ServiceError(`A team named "${input.name}" already exists.`);
    }
    const [row] = await tx
      .insert(teams)
      .values({ name: input.name, description: input.description || null })
      .returning({ id: teams.id });
    await recordAudit(tx, {
      userId: actorId,
      action: "team.create",
      entityType: "team",
      entityId: row.id,
      summary: `Created team "${input.name}"`,
    });
    return row.id;
  });
}

export async function updateTeam(
  actorId: number,
  teamId: number,
  input: {
    name: string;
    description?: string | null;
    isActive: boolean;
    memberIds: number[];
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    if (existing.length === 0) throw new ServiceError("Team not found.");
    await tx
      .update(teams)
      .set({
        name: input.name,
        description: input.description || null,
        isActive: input.isActive,
      })
      .where(eq(teams.id, teamId));
    // Replace membership set.
    await tx.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
    if (input.memberIds.length > 0) {
      const validUsers = await tx
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, input.memberIds));
      if (validUsers.length > 0) {
        await tx
          .insert(teamMembers)
          .values(validUsers.map((u) => ({ teamId, userId: u.id })));
      }
    }
    await recordAudit(tx, {
      userId: actorId,
      action: "team.update",
      entityType: "team",
      entityId: teamId,
      summary: `Updated team "${input.name}" (${input.memberIds.length} members)`,
    });
  });
}
