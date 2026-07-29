import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { auditEvents, invitations, teamMembers, users } from "@/server/db/schema";
import {
  acceptInvitation,
  createInvitation,
  getInvitationByToken,
  invitationDisplayStatus,
  invitationLink,
  reissueInvitation,
  revokeInvitation,
} from "@/server/services/invitations";
import { createTeam } from "@/server/services/teams";
import { verifyPassword } from "@/server/auth/password";
import { ServiceError } from "@/server/services/users";
import { makeUser, truncateAll } from "./helpers";

let adminId: number;

beforeEach(async () => {
  await truncateAll();
  await db.execute(sql`TRUNCATE TABLE invitations RESTART IDENTITY CASCADE`);
  adminId = (await makeUser({ role: "admin" })).id;
});

const baseInvite = () => ({
  email: "chris@example.com",
  displayName: "Chris Carter",
  role: "technician" as const,
  expiresInDays: 7,
});

describe("creation and token discipline", () => {
  it("stores only the token hash; the link carries the raw token once", async () => {
    const { token } = await createInvitation(adminId, baseInvite());
    expect(token.length).toBeGreaterThanOrEqual(40);
    const [row] = await db.select().from(invitations);
    expect(row.tokenHash).not.toContain(token);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    expect(invitationLink(token)).toContain(`/invite/${token}`);
    // Lookup by raw token resolves; by hash does not.
    expect((await getInvitationByToken(token)).state).toBe("ok");
    expect((await getInvitationByToken(row.tokenHash)).state).toBe("invalid");
  });

  it("normalizes email, validates it, and bounds expiry", async () => {
    await expect(
      createInvitation(adminId, { ...baseInvite(), email: "not-an-email" }),
    ).rejects.toThrow(/valid email/i);
    await expect(
      createInvitation(adminId, { ...baseInvite(), expiresInDays: 0 }),
    ).rejects.toThrow(/between 1 and 30/i);
    await createInvitation(adminId, {
      ...baseInvite(),
      email: "  MIXED@Example.COM ",
    });
    const [row] = await db.select().from(invitations);
    expect(row.email).toBe("mixed@example.com");
  });

  it("a new invitation for the same email revokes the older pending one", async () => {
    const first = await createInvitation(adminId, baseInvite());
    const second = await createInvitation(adminId, baseInvite());
    expect((await getInvitationByToken(first.token)).state).toBe("revoked");
    expect((await getInvitationByToken(second.token)).state).toBe("ok");
  });

  it("rejects a suggested username that is already taken", async () => {
    const u = await makeUser({ role: "technician" });
    await expect(
      createInvitation(adminId, { ...baseInvite(), username: u.username }),
    ).rejects.toThrow(/already taken/i);
  });
});

describe("acceptance", () => {
  it("creates the user with the invited role, team, and email; audited", async () => {
    const teamId = await createTeam(adminId, { name: "Mechanics" });
    const { token } = await createInvitation(adminId, {
      ...baseInvite(),
      teamId,
      username: "chrisc",
    });
    const { userId } = await acceptInvitation({
      token,
      username: "chrisc",
      displayName: "Chris Carter",
      password: "a-strong-password",
    });
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u.role).toBe("technician");
    expect(u.email).toBe("chris@example.com");
    expect(await verifyPassword("a-strong-password", u.passwordHash)).toBe(true);
    const membership = await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId));
    expect(membership).toHaveLength(1);
    expect(membership[0].teamId).toBe(teamId);
    const audit = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "invitation.accept"));
    expect(audit).toHaveLength(1);
  });

  it("a token can be used exactly once — the second attempt fails, no second account", async () => {
    const { token } = await createInvitation(adminId, baseInvite());
    await acceptInvitation({
      token,
      username: "once",
      displayName: "Once",
      password: "password-123",
    });
    await expect(
      acceptInvitation({
        token,
        username: "twice",
        displayName: "Twice",
        password: "password-123",
      }),
    ).rejects.toThrow(/already used/i);
    const count = await db.select({ n: sql<number>`count(*)::int` }).from(users);
    expect(count[0].n).toBe(2); // admin + the one accepted account
  });

  it("expired and revoked invitations are refused with distinct messages", async () => {
    const expired = await createInvitation(adminId, {
      ...baseInvite(),
      email: "old@example.com",
    });
    await db
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitations.id, expired.id));
    await expect(
      acceptInvitation({
        token: expired.token,
        username: "late",
        displayName: "Late",
        password: "password-123",
      }),
    ).rejects.toThrow(/expired/i);
    expect((await getInvitationByToken(expired.token)).state).toBe("expired");

    const revoked = await createInvitation(adminId, {
      ...baseInvite(),
      email: "gone@example.com",
    });
    await revokeInvitation(adminId, revoked.id);
    await expect(
      acceptInvitation({
        token: revoked.token,
        username: "gone",
        displayName: "Gone",
        password: "password-123",
      }),
    ).rejects.toThrow(/revoked/i);
  });

  it("enforces username format/uniqueness and password length", async () => {
    const { token } = await createInvitation(adminId, baseInvite());
    await expect(
      acceptInvitation({ token, username: "x", displayName: "X", password: "password-123" }),
    ).rejects.toThrow(/username/i);
    await expect(
      acceptInvitation({ token, username: "okname", displayName: "X", password: "short" }),
    ).rejects.toThrow(/at least 8/i);
    const u = await makeUser({ role: "requester" });
    await expect(
      acceptInvitation({
        token,
        username: u.username.toUpperCase(), // case-insensitive clash
        displayName: "X",
        password: "password-123",
      }),
    ).rejects.toThrow(/already taken/i);
    // Failures above must not have consumed the token.
    expect((await getInvitationByToken(token)).state).toBe("ok");
  });
});

describe("re-issue and revoke lifecycle", () => {
  it("re-issuing invalidates the old link immediately and restarts expiry", async () => {
    const { token: oldToken, id } = await createInvitation(adminId, baseInvite());
    const { token: newToken } = await reissueInvitation(adminId, id);
    expect((await getInvitationByToken(oldToken)).state).toBe("invalid");
    expect((await getInvitationByToken(newToken)).state).toBe("ok");
  });

  it("an expired invitation can be re-issued back to life", async () => {
    const { id } = await createInvitation(adminId, baseInvite());
    await db
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitations.id, id));
    const { token } = await reissueInvitation(adminId, id);
    expect((await getInvitationByToken(token)).state).toBe("ok");
  });

  it("accepted invitations cannot be re-issued or revoked", async () => {
    const { token, id } = await createInvitation(adminId, baseInvite());
    await acceptInvitation({
      token,
      username: "done",
      displayName: "Done",
      password: "password-123",
    });
    await expect(reissueInvitation(adminId, id)).rejects.toThrow(ServiceError);
    await expect(revokeInvitation(adminId, id)).rejects.toThrow(/pending/i);
  });

  it("display status derives expiry without a writer", async () => {
    expect(
      invitationDisplayStatus({ status: "pending", expiresAt: new Date(Date.now() + 1000) }),
    ).toBe("pending");
    expect(
      invitationDisplayStatus({ status: "pending", expiresAt: new Date(Date.now() - 1000) }),
    ).toBe("expired");
    expect(
      invitationDisplayStatus({ status: "revoked", expiresAt: new Date(Date.now() - 1000) }),
    ).toBe("revoked");
  });
});
