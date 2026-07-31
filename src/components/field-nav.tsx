"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import type { Role } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session";
import { ClipboardList, Home, QrCode, User, Wrench } from "@/components/icons";

type FieldNavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
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
    icon: Home,
    roles: ["admin", "manager", "technician", "requester"],
  },
  {
    href: "/work-orders?mine=1",
    label: "Work",
    icon: Wrench,
    roles: ["admin", "manager", "technician"],
  },
  {
    href: "/requests",
    label: "Requests",
    icon: ClipboardList,
    roles: ["admin", "manager", "technician", "requester"],
  },
  {
    href: "/scan",
    label: "Scan",
    icon: QrCode,
    roles: ["admin", "manager", "technician", "requester"],
  },
  {
    href: "/account",
    label: "Account",
    icon: User,
    roles: ["admin", "manager", "technician", "requester"],
  },
];

export function FieldNav({ user }: { user: SessionUser }) {
  const items = FIELD_NAV.filter((i) => i.roles.includes(user.role));
  const pathname = usePathname();
  return (
    <nav
      aria-label="Field navigation"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const base = item.href.split("?")[0];
          const active =
            pathname === base || pathname.startsWith(base + "/");
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium active:bg-gray-100 ${
                  active ? "text-brand-800" : "text-gray-500"
                }`}
              >
                <span className="relative">
                  <Icon aria-hidden className="h-5 w-5" />
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute -bottom-1.5 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-brand-600"
                    />
                  ) : null}
                </span>
                <span className={active ? "font-semibold" : undefined}>
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
