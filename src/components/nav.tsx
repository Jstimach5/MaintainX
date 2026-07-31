import Link from "next/link";
import type { Role } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session";
import { logoutAction } from "@/app/(auth)/login/actions";
import { unreadCount } from "@/server/services/notifications";
import { getOrgSettings } from "@/server/services/org";
import { SealTechLogo } from "@/components/brand";
import { Bell } from "@/components/icons";
import { PrimaryNav, type NavEntry } from "@/components/primary-nav";

type NavItem = { href: string; label: string; roles: Role[] };
type NavGroup = { label: string; items: NavItem[] };
type NavSpec = NavItem | NavGroup;

const ALL: Role[] = ["admin", "manager", "technician", "requester"];
const STAFF: Role[] = ["admin", "manager", "technician"];
const MANAGERS: Role[] = ["admin", "manager"];
const ADMIN: Role[] = ["admin"];

/**
 * Data-driven navigation, grouped into disclosure menus. Routes still
 * enforce roles server-side — filtering here is convenience, not security
 * (§4) — but the filtering does happen on the server, so links a role may
 * not use never reach the browser at all.
 */
const NAV: NavSpec[] = [
  { href: "/requests", label: "Requests", roles: ALL },
  {
    label: "Work",
    items: [
      { href: "/dashboard", label: "Dashboard", roles: ALL },
      { href: "/schedule", label: "Schedule", roles: STAFF },
      { href: "/work-orders", label: "Work orders", roles: STAFF },
      { href: "/reports", label: "Reports", roles: MANAGERS },
    ],
  },
  {
    label: "Maintenance",
    items: [
      { href: "/meters", label: "Meters", roles: STAFF },
      { href: "/pm-plans", label: "PM", roles: MANAGERS },
      { href: "/procedures", label: "Procedures", roles: MANAGERS },
    ],
  },
  {
    label: "Assets",
    items: [
      { href: "/assets", label: "Assets", roles: STAFF },
      { href: "/sites", label: "Sites", roles: STAFF },
      { href: "/locations", label: "Locations", roles: STAFF },
      { href: "/imports", label: "Imports", roles: ADMIN },
      { href: "/admin/audit", label: "Audit", roles: ADMIN },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/admin/users", label: "Users", roles: ADMIN },
      { href: "/admin/teams", label: "Teams", roles: ADMIN },
      { href: "/admin/settings", label: "Settings", roles: ADMIN },
    ],
  },
];

/**
 * Filter by role, then degrade: a group with nothing visible disappears, and
 * a group down to one item becomes a plain link labelled with that item —
 * no dropdown that only ever holds a single destination.
 */
function entriesFor(role: Role): NavEntry[] {
  const out: NavEntry[] = [];
  for (const spec of NAV) {
    if ("href" in spec) {
      if (spec.roles.includes(role)) {
        out.push({ kind: "link", label: spec.label, href: spec.href });
      }
      continue;
    }
    const items = spec.items.filter((i) => i.roles.includes(role));
    if (items.length === 0) continue;
    if (items.length === 1) {
      out.push({ kind: "link", label: items[0].label, href: items[0].href });
    } else {
      out.push({
        kind: "group",
        label: spec.label,
        items: items.map(({ href, label }) => ({ href, label })),
      });
    }
  }
  return out;
}

export async function AppNav({ user }: { user: SessionUser }) {
  const [unread, org] = await Promise.all([
    unreadCount(user.id),
    getOrgSettings(),
  ]);
  const entries = entriesFor(user.role);
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
        <PrimaryNav entries={entries} />
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
