import { requireRole } from "@/server/auth/guards";
import { listUsers } from "@/server/services/users";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import Link from "next/link";
import { setActiveAction } from "./actions";

export const metadata = { title: "Users" };

const roleTone: Record<string, BadgeTone> = {
  admin: "purple",
  manager: "blue",
  technician: "green",
  requester: "gray",
};

export default async function UsersPage() {
  await requireRole("admin");
  const users = await listUsers();
  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Accounts are deactivated, never deleted — history stays intact."
        actions={<ButtonLink href="/admin/users/new">Add user</ButtonLink>}
      />
      <Card className="divide-y divide-gray-100 p-0">
        {users.map((u) => (
          <div
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
          >
            <div className="min-w-0">
              <Link
                href={`/admin/users/${u.id}`}
                className="font-medium text-blue-800 hover:underline"
              >
                {u.displayName}
              </Link>
              <p className="text-sm text-gray-500">
                {u.username}
                {u.email ? ` · ${u.email}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={roleTone[u.role]}>{u.role}</Badge>
              {!u.isActive ? <Badge tone="red">deactivated</Badge> : null}
              <form action={setActiveAction}>
                <input type="hidden" name="userId" value={u.id} />
                <input
                  type="hidden"
                  name="active"
                  value={u.isActive ? "false" : "true"}
                />
                <button
                  type="submit"
                  className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
                >
                  {u.isActive ? "Deactivate" : "Reactivate"}
                </button>
              </form>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
