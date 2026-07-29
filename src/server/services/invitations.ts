import crypto from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { invitations, teamMembers, teams, users } from "@/server/db/schema";
import { hashPassword } from "@/server/auth/password";
import { recordAudit } from "./audit";
import { ServiceError } from "./users";
import type { Role } from "@/server/auth/guards";
import { appUrl } from "@/lib/app-url";

export type InvitationRow = typeof invitations.$inferSelect;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Display status: "expired" is pending past its expiry, never stored. */
export function invitationDisplayStatus(
  inv: Pick<InvitationRow, "status" | "expiresAt">,
): "pending" | "accepted" | "revoked" | "expired" {
  if (inv.status === "pending" && inv.expiresAt < new Date()) return "expired";
  return inv.status;
}

export function invitationLink(token: string): string {
  return appUrl(`/invite/${token}`);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CreateInvitationInput = {
  email: string;
  displayName: string;
  /** Optional; when omitted the invitee picks one at acceptance. */
  username?: string | null;
  role: Role;
  teamId?: number | null;
  personalMessage?: string | null;
  /** Days until expiry (1–30). */
  expiresInDays: number;
};

/**
 * Create an invitation. Returns the raw token exactly once — the caller
 * shows/emails it; only the hash is stored. Enumeration-safe: whether the
 * email already belongs to an account is NOT revealed to the invitee side;
 * the admin screen is behind admin auth, where the user list is visible
 * anyway.
 */
export async function createInvitation(
  actorId: number,
  input: CreateInvitationInput,
): Promise<{ id: number; token: string; expiresAt: Date }> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new ServiceError("Enter a valid email address.");
  const displayName = input.displayName.trim();
  if (!displayName) throw new ServiceError("Display name is required.");
  if (!(input.expiresInDays >= 1 && input.expiresInDays <= 30)) {
    throw new ServiceError("Expiration must be between 1 and 30 days.");
  }
  const username = input.username?.trim() || null;
  if (username) {
    const clash = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = ${username.toLowerCase()}`)
      .limit(1);
    if (clash.length > 0) {
      throw new ServiceError("That username is already taken.");
    }
  }
  if (input.teamId != null) {
    const team = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.id, input.teamId))
      .limit(1);
    if (team.length === 0) throw new ServiceError("Team not found.");
  }

  const token = newToken();
  const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
  const id = await db.transaction(async (tx) => {
    // One live pending invitation per email: revoke older pending ones so
    // the newest link is always the only valid one.
    const stale = await tx
      .update(invitations)
      .set({ status: "revoked", revokedBy: actorId, revokedAt: new Date() })
      .where(and(eq(invitations.email, email), eq(invitations.status, "pending")))
      .returning({ id: invitations.id });
    const [row] = await tx
      .insert(invitations)
      .values({
        email,
        displayName,
        username,
        role: input.role,
        teamId: input.teamId ?? null,
        personalMessage: input.personalMessage?.trim() || null,
        tokenHash: hashToken(token),
        expiresAt,
        invitedBy: actorId,
      })
      .returning({ id: invitations.id });
    await recordAudit(tx, {
      userId: actorId,
      action: "invitation.create",
      entityType: "invitation",
      entityId: row.id,
      summary: `Invited ${email} as ${input.role}${stale.length > 0 ? " (superseding a previous invitation)" : ""}`,
      newValue: { email, role: input.role, expiresAt: expiresAt.toISOString() },
    });
    return row.id;
  });
  return { id, token, expiresAt };
}

/**
 * Re-issue an invitation: a NEW token replaces the old (the old link dies
 * immediately), expiry restarts. Only pending/expired invitations can be
 * resent; accepting or revoking is final.
 */
export async function reissueInvitation(
  actorId: number,
  invitationId: number,
  expiresInDays = 7,
): Promise<{ token: string; expiresAt: Date }> {
  const [inv] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.id, invitationId))
    .limit(1);
  if (!inv) throw new ServiceError("Invitation not found.");
  if (inv.status !== "pending") {
    throw new ServiceError(
      `This invitation was ${inv.status} — create a new one instead.`,
    );
  }
  const token = newToken();
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);
  await db.transaction(async (tx) => {
    await tx
      .update(invitations)
      .set({ tokenHash: hashToken(token), expiresAt })
      .where(eq(invitations.id, invitationId));
    await recordAudit(tx, {
      userId: actorId,
      action: "invitation.reissue",
      entityType: "invitation",
      entityId: invitationId,
      summary: `Re-issued invitation for ${inv.email} (previous link invalidated)`,
    });
  });
  return { token, expiresAt };
}

export async function revokeInvitation(
  actorId: number,
  invitationId: number,
): Promise<void> {
  const updated = await db
    .update(invitations)
    .set({ status: "revoked", revokedBy: actorId, revokedAt: new Date() })
    .where(
      and(eq(invitations.id, invitationId), eq(invitations.status, "pending")),
    )
    .returning({ email: invitations.email });
  if (updated.length === 0) {
    throw new ServiceError("Only pending invitations can be revoked.");
  }
  await recordAudit(db, {
    userId: actorId,
    action: "invitation.revoke",
    entityType: "invitation",
    entityId: invitationId,
    summary: `Revoked invitation for ${updated[0].email}`,
  });
}

export async function listInvitations() {
  return db
    .select({
      inv: invitations,
      invitedByName: users.displayName,
      teamName: teams.name,
    })
    .from(invitations)
    .innerJoin(users, eq(invitations.invitedBy, users.id))
    .leftJoin(teams, eq(invitations.teamId, teams.id))
    .orderBy(desc(invitations.createdAt));
}

export async function recordInvitationSend(
  invitationId: number,
  result: { ok: true } | { ok: false; error: string },
): Promise<void> {
  await db
    .update(invitations)
    .set(
      result.ok
        ? {
            lastSentAt: new Date(),
            sendCount: sql`${invitations.sendCount} + 1`,
            lastSendError: null,
          }
        : { lastSendError: result.error },
    )
    .where(eq(invitations.id, invitationId));
}

/**
 * Look up an invitation by raw token for the acceptance page. Returns a
 * safe view (never the hash). Distinguishes the states the page needs to
 * message clearly; a token that matches nothing is simply invalid.
 */
export async function getInvitationByToken(token: string): Promise<
  | { state: "invalid" }
  | { state: "expired" | "revoked" | "accepted" }
  | {
      state: "ok";
      id: number;
      email: string;
      displayName: string;
      username: string | null;
      role: Role;
      orgSuggestsUsername: boolean;
    }
> {
  if (!token || token.length > 200) return { state: "invalid" };
  const [inv] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, hashToken(token)))
    .limit(1);
  if (!inv) return { state: "invalid" };
  const display = invitationDisplayStatus(inv);
  if (display !== "pending") return { state: display };
  return {
    state: "ok",
    id: inv.id,
    email: inv.email,
    displayName: inv.displayName,
    username: inv.username,
    role: inv.role,
    orgSuggestsUsername: inv.username != null,
  };
}

/**
 * Accept an invitation: create the user and consume the token in one
 * transaction. Exactly-once is enforced by the conditional UPDATE on
 * status='pending' — if two acceptances race, one flips the row and the
 * other sees zero rows and fails cleanly with no second account.
 */
export async function acceptInvitation(input: {
  token: string;
  username: string;
  displayName: string;
  password: string;
}): Promise<{ userId: number }> {
  const username = input.username.trim();
  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(username)) {
    throw new ServiceError(
      "Username must be 3–50 characters: letters, numbers, dots, dashes.",
    );
  }
  const displayName = input.displayName.trim();
  if (!displayName) throw new ServiceError("Display name is required.");
  if (input.password.length < 8) {
    throw new ServiceError("Password must be at least 8 characters.");
  }
  const [inv] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, hashToken(input.token)))
    .limit(1);
  if (!inv) throw new ServiceError("This invitation link is not valid.");
  const display = invitationDisplayStatus(inv);
  if (display === "revoked") {
    throw new ServiceError("This invitation was revoked — ask your administrator for a new one.");
  }
  if (display === "expired") {
    throw new ServiceError("This invitation has expired — ask your administrator for a new one.");
  }
  if (display === "accepted") {
    throw new ServiceError("This invitation was already used. Try signing in instead.");
  }

  const clash = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = ${username.toLowerCase()}`)
    .limit(1);
  if (clash.length > 0) throw new ServiceError("That username is already taken.");

  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    // Consume the token first; zero rows means someone else just did.
    const consumed = await tx
      .update(invitations)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(
        and(
          eq(invitations.id, inv.id),
          eq(invitations.status, "pending"),
          sql`${invitations.expiresAt} > now()`,
        ),
      )
      .returning({ id: invitations.id });
    if (consumed.length === 0) {
      throw new ServiceError("This invitation was already used or has expired.");
    }
    const [user] = await tx
      .insert(users)
      .values({
        username,
        passwordHash,
        displayName,
        email: inv.email,
        role: inv.role,
      })
      .returning({ id: users.id });
    await tx
      .update(invitations)
      .set({ acceptedUserId: user.id })
      .where(eq(invitations.id, inv.id));
    if (inv.teamId != null) {
      await tx.insert(teamMembers).values({ teamId: inv.teamId, userId: user.id });
    }
    await recordAudit(tx, {
      userId: user.id,
      action: "invitation.accept",
      entityType: "invitation",
      entityId: inv.id,
      summary: `${inv.email} accepted their invitation as "${username}"`,
    });
    return { userId: user.id };
  });
}
