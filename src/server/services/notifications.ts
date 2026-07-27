import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { notifications, users } from "@/server/db/schema";

/**
 * Notification adapter (§8): in-app rows always; email is a stub behind
 * SMTP_URL so credentials-less deployments still work. Additional channels
 * plug in here without touching callers.
 */
export type NotificationInput = {
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
};

export async function notifyUsers(
  userIds: number[],
  input: NotificationInput,
): Promise<void> {
  const unique = [...new Set(userIds)].filter((id) => id > 0);
  if (unique.length === 0) return;
  await db.insert(notifications).values(
    unique.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    })),
  );
  if (process.env.SMTP_URL) {
    // Email adapter stub: a real SMTP client would send here. Deliberately
    // fire-and-forget; in-app notifications are the source of truth.
    console.log(
      `[notify] email adapter: would send "${input.title}" to users ${unique.join(",")}`,
    );
  }
}

/** All active managers + admins (request review audience). */
export async function managerAudience(): Promise<number[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(inArray(users.role, ["admin", "manager"]), eq(users.isActive, true)),
    );
  return rows.map((r) => r.id);
}

export async function listNotifications(userId: number, limit = 50) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadCount(userId: number): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), eq(notifications.isRead, false)),
    );
  return rows[0]?.count ?? 0;
}

export async function markAllRead(userId: number): Promise<void> {
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(eq(notifications.userId, userId), eq(notifications.isRead, false)),
    );
}
