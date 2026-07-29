import Link from "next/link";
import { requireUser } from "@/server/auth/guards";
import { logoutAction } from "@/app/(auth)/login/actions";
import { getOrgSettings } from "@/server/services/org";
import { unreadCount } from "@/server/services/notifications";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Account" };
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator",
  manager: "Manager",
  technician: "Technician",
  requester: "Requester",
};

/**
 * Account screen — the fifth field-nav destination. Identity, the links
 * that don't belong in a five-slot bar, and sign-out. Push-notification
 * opt-in lands here in M7.
 */
export default async function AccountPage() {
  const user = await requireUser();
  const [org, unread] = await Promise.all([
    getOrgSettings(),
    unreadCount(user.id),
  ]);
  const isManager = user.role === "admin" || user.role === "manager";
  const isStaff = user.role !== "requester";

  const links: { href: string; label: string; show: boolean }[] = [
    { href: "/notifications", label: `Notifications${unread > 0 ? ` (${unread})` : ""}`, show: true },
    { href: "/work-orders?mine=1", label: "My work orders", show: isStaff },
    { href: "/requests", label: "My requests", show: true },
    { href: "/schedule", label: "My schedule", show: isStaff },
    { href: "/assets", label: "Assets", show: isStaff },
    { href: "/meters", label: "Meters", show: isStaff },
    { href: "/sites", label: "Sites & locations", show: isStaff },
    { href: "/reports", label: "Reports", show: isManager },
    { href: "/pm-plans", label: "Maintenance plans", show: isManager },
    { href: "/procedures", label: "Procedures", show: isManager },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Account" />

      <Card>
        <p className="text-lg font-semibold">{user.displayName}</p>
        <p className="text-sm text-gray-500">
          {user.username} · {ROLE_LABEL[user.role] ?? user.role}
        </p>
        {user.email ? (
          <p className="text-sm text-gray-500">{user.email}</p>
        ) : null}
        <p className="mt-2 text-xs text-gray-400">
          {org.name} · times shown in {org.timezone}
        </p>
      </Card>

      <Card className="p-0">
        <ul className="divide-y divide-gray-100">
          {links
            .filter((l) => l.show)
            .map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="flex min-h-12 items-center justify-between px-4 text-sm font-medium text-gray-800 active:bg-gray-50"
                >
                  {l.label}
                  <span aria-hidden className="text-gray-300">
                    ›
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      </Card>

      <Card>
        <p className="mb-2 text-sm text-gray-600">
          Trouble with a screen? Your administrator can help — password
          changes and role updates are done for you.
        </p>
        <form action={logoutAction}>
          <button
            type="submit"
            className="min-h-12 w-full rounded-md border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 active:bg-red-100"
          >
            Sign out
          </button>
        </form>
      </Card>
    </div>
  );
}
