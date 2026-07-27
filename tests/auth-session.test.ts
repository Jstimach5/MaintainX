import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { auditEvents, sessions } from "@/server/db/schema";
import {
  createSession,
  getUserBySessionToken,
  destroySession,
  purgeExpiredSessions,
} from "@/server/auth/session";
import {
  createUser,
  resetPassword,
  setUserActive,
  setupOrganization,
  updateUser,
  ServiceError,
} from "@/server/services/users";
import { makeUser, truncateAll } from "./helpers";

beforeEach(async () => {
  await truncateAll();
});

describe("sessions", () => {
  it("resolves a valid token to its user", async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id);
    const found = await getUserBySessionToken(token);
    expect(found?.id).toBe(u.id);
  });

  it("does not resolve a bogus token", async () => {
    await makeUser();
    expect(await getUserBySessionToken("not-a-real-token")).toBeNull();
  });

  it("does not resolve an expired session and purges it", async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, u.id));
    expect(await getUserBySessionToken(token)).toBeNull();
    await purgeExpiredSessions();
    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, u.id));
    expect(rows).toHaveLength(0);
  });

  it("destroySession revokes exactly that session", async () => {
    const u = await makeUser();
    const a = await createSession(u.id);
    const b = await createSession(u.id);
    await destroySession(a.token);
    expect(await getUserBySessionToken(a.token)).toBeNull();
    expect(await getUserBySessionToken(b.token)).not.toBeNull();
  });

  it("deactivating a user rejects their live session immediately", async () => {
    const admin = await makeUser({ role: "admin" });
    const tech = await makeUser({ role: "technician" });
    const { token } = await createSession(tech.id);
    expect(await getUserBySessionToken(token)).not.toBeNull();

    await setUserActive(admin.id, tech.id, false);

    expect(await getUserBySessionToken(token)).toBeNull();
    // Session rows are deleted, not just filtered.
    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, tech.id));
    expect(rows).toHaveLength(0);
  });

  it("password reset revokes all of the user's sessions", async () => {
    const admin = await makeUser({ role: "admin" });
    const tech = await makeUser({ role: "technician" });
    const { token } = await createSession(tech.id);
    await resetPassword(admin.id, tech.id, "new-password-123");
    expect(await getUserBySessionToken(token)).toBeNull();
  });
});

describe("user management guards", () => {
  it("refuses to deactivate the last active admin", async () => {
    const admin = await makeUser({ role: "admin" });
    await expect(setUserActive(admin.id, admin.id, false)).rejects.toThrow(
      ServiceError,
    );
  });

  it("refuses to demote the last active admin", async () => {
    const admin = await makeUser({ role: "admin" });
    await expect(
      updateUser(admin.id, admin.id, {
        displayName: "X",
        role: "technician",
      }),
    ).rejects.toThrow(ServiceError);
  });

  it("allows deactivating an admin when another active admin exists", async () => {
    const a1 = await makeUser({ role: "admin" });
    const a2 = await makeUser({ role: "admin" });
    await setUserActive(a1.id, a2.id, false);
  });

  it("rejects duplicate usernames case-insensitively", async () => {
    const admin = await makeUser({ role: "admin", username: "Boss" });
    await expect(
      createUser(admin.id, {
        username: "boss",
        displayName: "Dup",
        role: "technician",
        password: "password123",
      }),
    ).rejects.toThrow(ServiceError);
  });

  it("setup refuses to run twice", async () => {
    await setupOrganization({
      orgName: "Org",
      timezone: "America/Chicago",
      username: "root",
      displayName: "Root",
      password: "password123",
    });
    await expect(
      setupOrganization({
        orgName: "Org2",
        timezone: "UTC",
        username: "root2",
        displayName: "Root2",
        password: "password123",
      }),
    ).rejects.toThrow(ServiceError);
  });
});

describe("audit plumbing", () => {
  it("mutations write audit events in the same transaction", async () => {
    const admin = await makeUser({ role: "admin" });
    const id = await createUser(admin.id, {
      username: "audited",
      displayName: "Audited",
      role: "requester",
      password: "password123",
    });
    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.entityType, "user"));
    const created = events.find(
      (e) => e.action === "user.create" && e.entityId === String(id),
    );
    expect(created).toBeDefined();
    expect(created?.userId).toBe(admin.id);
  });
});
