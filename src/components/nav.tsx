import Link from "next/link";
import type { Role } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session";
import { logoutAction } from "@/app/(auth)/login/actions";
import { unreadCount } from "@/server/services/notifications";

type NavItem = { href: string; label: string; roles: Role[] };

/**
 * Data-driven navigation. Routes still enforce roles server-side — hiding a
 * link here is convenience, not security (§4).
 */
const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["admin", "manager", "technician", "requester"] },
  { href: "/work-orders", label: "Work orders", roles: ["admin", "manager", "technician"] },
  { href: "/requests", label: "Requests", roles: ["admin", "manager", "technician", "requester"] },
  { href: "/assets", label: "Assets", roles: ["admin", "manager", "technician"] },
  { href: "/sites", label: "Sites", roles: ["admin", "manager", "technician"] },
  { href: "/procedures", label: "Procedures", roles: ["admin", "manager"] },
  { href: "/pm-plans", label: "PM", roles: ["admin", "manager"] },
  { href: "/admin/users", label: "Users", roles: ["admin"] },
  { href: "/admin/teams", label: "Teams", roles: ["admin"] },
];

export async function AppNav({ user }: { user: SessionUser }) {
  const items = NAV_ITEMS.filter((i) => i.roles.includes(user.role));
  const unread = await unreadCount(user.id);
  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4">
        <Link
          href="/dashboard"
          className="shrink-0 py-3 text-sm font-bold text-blue-800"
        >
          Maintenance&nbsp;Manager
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/notifications"
          className="relative shrink-0 rounded-md px-2 py-2 text-sm text-gray-500 hover:bg-gray-100"
          aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        >
          🔔
          {unread > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Link>
        <form action={logoutAction} className="shrink-0">
          <button
            type="submit"
            className="rounded-md px-3 py-2 text-sm text-gray-500 hover:bg-gray-100"
            title={`Signed in as ${user.displayName}`}
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
