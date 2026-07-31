import Link from "next/link";
import type { Role } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session";
import { logoutAction } from "@/app/(auth)/login/actions";
import { unreadCount } from "@/server/services/notifications";
import { getOrgSettings } from "@/server/services/org";
import { SealTechLogo } from "@/components/brand";
import { Bell } from "@/components/icons";

type NavItem = { href: string; label: string; roles: Role[] };

/**
 * Data-driven navigation. Routes still enforce roles server-side — hiding a
 * link here is convenience, not security (§4).
 * (Grouped disclosure menus land with the nav redesign phase; this is the
 * flat row on the branded header.)
 */
const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["admin", "manager", "technician", "requester"] },
  { href: "/work-orders", label: "Work orders", roles: ["admin", "manager", "technician"] },
  { href: "/requests", label: "Requests", roles: ["admin", "manager", "technician", "requester"] },
  { href: "/assets", label: "Assets", roles: ["admin", "manager", "technician"] },
  { href: "/sites", label: "Sites", roles: ["admin", "manager", "technician"] },
  { href: "/procedures", label: "Procedures", roles: ["admin", "manager"] },
  { href: "/pm-plans", label: "PM", roles: ["admin", "manager"] },
  { href: "/meters", label: "Meters", roles: ["admin", "manager", "technician"] },
  { href: "/schedule", label: "Schedule", roles: ["admin", "manager", "technician"] },
  { href: "/reports", label: "Reports", roles: ["admin", "manager"] },
  { href: "/imports", label: "Imports", roles: ["admin"] },
  { href: "/admin/users", label: "Users", roles: ["admin"] },
  { href: "/admin/teams", label: "Teams", roles: ["admin"] },
  { href: "/admin/audit", label: "Audit", roles: ["admin"] },
  { href: "/admin/settings", label: "Settings", roles: ["admin"] },
];

export async function AppNav({ user }: { user: SessionUser }) {
  const items = NAV_ITEMS.filter((i) => i.roles.includes(user.role));
  const [unread, org] = await Promise.all([
    unreadCount(user.id),
    getOrgSettings(),
  ]);
  return (
    <header className="sticky top-0 z-30 border-b border-brand-900 bg-brand-950">
      <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-4 sm:px-6 xl:px-8">
        <Link
          href="/dashboard"
          aria-label={`${org.name} — home`}
          className="shrink-0 rounded-md py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
        >
          <SealTechLogo onDark />
        </Link>
        {/* Small screens use the bottom field nav instead of this row. */}
        <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto py-1 md:flex">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/notifications"
          className="relative ml-auto shrink-0 rounded-md p-2 text-gray-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300 md:ml-0"
          aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        >
          <Bell aria-hidden className="h-5 w-5" />
          {unread > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Link>
        <form action={logoutAction} className="shrink-0">
          <button
            type="submit"
            className="rounded-md px-3 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
            title={`Signed in as ${user.displayName}`}
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
