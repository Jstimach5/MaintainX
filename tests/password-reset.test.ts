import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { passwordResets, sessions, users } from "@/server/db/schema";
import {
  changeOwnPassword,
  completePasswordReset,
  getResetByToken,
  requestPasswordReset,
} from "@/server/services/passwordReset";
import { createUser, resetPassword } from "@/server/services/users";
import { createSession, getUserBySessionToken } from "@/server/auth/session";
import { verifyPassword } from "@/server/auth/password";
import { makeUser, truncateAll } from "./helpers";

let adminId: number;

beforeEach(async () => {
  await truncateAll();
  await db.execute(sql`TRUNCATE TABLE password_resets RESTART IDENTITY CASCADE`);
  adminId = (await makeUser({ role: "admin" })).id;
});

async function emailUser() {
  const id = await createUser(adminId, {
    username: "resetme",
    displayName: "Reset Me",
    email: "resetme@example.com",
    role: "technician",
    password: "old-password-1",
  });
  return id;
}

describe("request", () => {
  it("matches by username or email (case-insensitive), token hashed at rest", async () => {
    await emailUser();
    const byName = await requestPasswordReset("RESETME");
    expect(byName.match).toBe(true);
    const byEmail = await requestPasswordReset("ResetMe@Example.com");
    expect(byEmail.match).toBe(true);
    const rows = await db.select().from(passwordResets);
    for (const r of rows) {
      expect(r.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    }
    // The newer request killed the older token.
    if (byName.match && byEmail.match) {
      expect((await getResetByToken(byName.token)).ok).toBe(false);
      expect((await getResetByToken(byEmail.token)).ok).toBe(true);
    }
  });

  it("no-email and unknown accounts return the same non-committal shape", async () => {
    const noEmail = await makeUser({ role: "technician" }); // helpers create no email
    expect(await requestPasswordReset(noEmail.username)).toEqual({ match: false });
    expect(await requestPasswordReset("nobody-here")).toEqual({ match: false });
    expect(await db.select().from(passwordResets)).toHaveLength(0);
  });

  it("deactivated users cannot start a reset", async () => {
    const id = await emailUser();
    await db.update(users).set({ isActive: false }).where(eq(users.id, id));
    expect(await requestPasswordReset("resetme")).toEqual({ match: false });
  });
});

describe("completion", () => {
  it("sets the password once, revokes every session, and audits", async () => {
    const id = await emailUser();
    const s1 = await createSession(id);
    const s2 = await createSession(id);
    const req = await requestPasswordReset("resetme");
    if (!req.match) throw new Error("expected match");

    await completePasswordReset(req.token, "brand-new-password");
    const [u] = await db.select().from(users).where(eq(users.id, id));
    expect(await verifyPassword("brand-new-password", u.passwordHash)).toBe(true);
    // A reset is the recovery path — nothing survives it.
    expect(await getUserBySessionToken(s1.token)).toBeNull();
    expect(await getUserBySessionToken(s2.token)).toBeNull();
    // One-shot: the same link cannot be replayed.
    await expect(
      completePasswordReset(req.token, "third-password-x"),
    ).rejects.toThrow(/no longer valid|already used/i);
  });

  it("expired tokens are refused", async () => {
    await emailUser();
    const req = await requestPasswordReset("resetme");
    if (!req.match) throw new Error("expected match");
    await db
      .update(passwordResets)
      .set({ expiresAt: new Date(Date.now() - 1000) });
    await expect(
      completePasswordReset(req.token, "whatever-123"),
    ).rejects.toThrow(/no longer valid/i);
    expect((await getResetByToken(req.token)).ok).toBe(false);
  });

  it("completing a reset clears the forced-change flag", async () => {
    const id = await emailUser(); // createUser sets mustChangePassword
    let [u] = await db.select().from(users).where(eq(users.id, id));
    expect(u.mustChangePassword).toBe(true);
    const req = await requestPasswordReset("resetme");
    if (!req.match) throw new Error("expected match");
    await completePasswordReset(req.token, "chosen-by-user-1");
    [u] = await db.select().from(users).where(eq(users.id, id));
    expect(u.mustChangePassword).toBe(false);
  });
});

describe("first-login force + own change", () => {
  it("admin-created accounts and admin resets force a change; own change clears it and keeps only the current session", async () => {
    const id = await emailUser();
    const keep = await createSession(id);
    const other = await createSession(id);
    const keepUser = await getUserBySessionToken(keep.token);
    expect(keepUser?.mustChangePassword).toBe(true);

    const crypto = await import("node:crypto");
    const keepHash = crypto.createHash("sha256").update(keep.token).digest("hex");
    await changeOwnPassword(id, "old-password-1", "my-own-password", keepHash);

    const after = await getUserBySessionToken(keep.token);
    expect(after?.mustChangePassword).toBe(false);
    expect(await getUserBySessionToken(other.token)).toBeNull();

    // Admin reset re-arms the flag.
    await resetPassword(adminId, id, "temp-again-123");
    const [u] = await db.select().from(users).where(eq(users.id, id));
    expect(u.mustChangePassword).toBe(true);
    expect(await db.select().from(sessions).where(eq(sessions.userId, id))).toHaveLength(0);
  });

  it("own change requires the correct current password", async () => {
    const id = await emailUser();
    await expect(
      changeOwnPassword(id, "wrong-current", "whatever-new-1"),
    ).rejects.toThrow(/current password is wrong/i);
  });
});
