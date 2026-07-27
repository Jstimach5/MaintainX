import Link from "next/link";
import type { Role } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session";
import { logoutAction } from "@/app/(auth)/login/actions";

type NavItem = { href: string; label: string; roles: Role[] };

/**
 * Data-driven navigation. Routes still enforce roles server-side — hiding a
 * link here is convenience, not security (§4).
 */
const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["admin", "manager", "technician", "requester"] },
  { href: "/work-orders", label: "Work orders", roles: ["admin", "manager", "technician"] },
  { href: "/assets", label: "Assets", roles: ["admin", "manager", "technician"] },
  { href: "/sites", label: "Sites", roles: ["admin", "manager", "technician"] },
  { href: "/procedures", label: "Procedures", roles: ["admin", "manager"] },
  { href: "/admin/users", label: "Users", roles: ["admin"] },
  { href: "/admin/teams", label: "Teams", roles: ["admin"] },
];

export function AppNav({ user }: { user: SessionUser }) {
  const items = NAV_ITEMS.filter((i) => i.roles.includes(user.role));
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
