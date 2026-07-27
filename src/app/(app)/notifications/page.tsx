import Link from "next/link";
import { requireUser } from "@/server/auth/guards";
import {
  listNotifications,
  markAllRead,
} from "@/server/services/notifications";
import { getOrgSettings } from "@/server/services/org";
import { formatDateTime } from "@/lib/format";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const org = await getOrgSettings();
  const items = await listNotifications(user.id);
  // Viewing the list clears the unread badge.
  await markAllRead(user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Notifications" />
      {items.length === 0 ? (
        <EmptyState title="Nothing here yet" hint="Updates about your requests and work will appear here." />
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {items.map((n) => (
            <div
              key={n.id}
              className={`px-4 py-3 ${n.isRead ? "" : "bg-blue-50/50"}`}
            >
              {n.link ? (
                <Link href={n.link} className="font-medium text-blue-800 hover:underline">
                  {n.title}
                </Link>
              ) : (
                <p className="font-medium">{n.title}</p>
              )}
              {n.body ? <p className="text-sm text-gray-600">{n.body}</p> : null}
              <p className="mt-0.5 text-xs text-gray-400">
                {formatDateTime(n.createdAt, org.timezone)}
              </p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
