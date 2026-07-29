import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { notifications, users } from "@/server/db/schema";
import { emailConfigured, sendEmail } from "@/server/email";
import { appUrl } from "@/lib/app-url";

/**
 * Notification adapter (§8): in-app rows always; real email fan-out when
 * SMTP is configured (dev deployments without credentials keep working).
 * Additional channels plug in here without touching callers.
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
  // Real email fan-out when SMTP is configured (src/server/email). Best
  // effort by design: in-app notifications are the source of truth, so a
  // mail failure is logged (by the adapter) and never fails the caller.
  if (emailConfigured()) {
    const recipients = await db
      .select({ email: users.email, displayName: users.displayName })
      .from(users)
      .where(and(inArray(users.id, unique), eq(users.isActive, true)));
    const { readOrgSettings } = await import("./org");
    const org = await readOrgSettings();
    for (const r of recipients) {
      if (!r.email) continue;
      void sendEmail({
        to: r.email,
        subject: `${org.name}: ${input.title}`,
        text: `${input.title}\n\n${input.body ?? ""}${input.link ? `\n\n${appUrl(input.link)}` : ""}`,
        html: `<p>${escapeHtml(input.title)}</p>${input.body ? `<p>${escapeHtml(input.body)}</p>` : ""}${input.link ? `<p><a href="${appUrl(input.link)}">Open in the maintenance system</a></p>` : ""}`,
      });
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
