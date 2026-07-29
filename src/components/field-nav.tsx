import Link from "next/link";
import type { Role } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session";

type FieldNavItem = {
  href: string;
  label: string;
  icon: string;
  roles: Role[];
};

/**
 * Field navigation: at most five destinations, thumb-reachable at the
 * bottom of the screen. Shown only at small widths — the desktop header
 * (components/nav.tsx) still carries the full route list. Hiding a link
 * is convenience, never security; every route re-checks the role.
 */
const FIELD_NAV: FieldNavItem[] = [
  {
    href: "/dashboard",
    label: "Home",
    icon: "🏠",
    roles: ["admin", "manager", "technician", "requester"],
  },
  {
    href: "/work-orders?mine=1",
    label: "Work",
    icon: "🔧",
    roles: ["admin", "manager", "technician"],
  },
  {
    href: "/requests",
    label: "Requests",
    icon: "📝",
    roles: ["admin", "manager", "technician", "requester"],
  },
  {
    href: "/scan",
    label: "Scan",
    icon: "📷",
    roles: ["admin", "manager", "technician", "requester"],
  },
  {
    href: "/account",
    label: "Account",
    icon: "👤",
    roles: ["admin", "manager", "technician", "requester"],
  },
];

export function FieldNav({ user }: { user: SessionUser }) {
  const items = FIELD_NAV.filter((i) => i.roles.includes(user.role));
  return (
    <nav
      aria-label="Field navigation"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => (
          <li key={item.href} className="flex-1">
            <Link
              href={item.href}
              className="flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium text-gray-600 active:bg-gray-100"
            >
              <span aria-hidden className="text-xl leading-none">
                {item.icon}
              </span>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
