import { requireRole } from "@/server/auth/guards";
import { listUsers } from "@/server/services/users";
import {
  invitationDisplayStatus,
  listInvitations,
} from "@/server/services/invitations";
import { getOrgSettings } from "@/server/services/org";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, ButtonLink, Card, PageHeader } from "@/components/ui";
import { ListLayout } from "@/components/layout";
import type { BadgeTone } from "@/components/ui";
import Link from "next/link";
import { setActiveAction } from "./actions";
import { ConfirmSubmit } from "@/components/dialog";
import { ReissueButton, RevokeButton } from "./invite-forms";

export const metadata = { title: "Users" };
export const dynamic = "force-dynamic";

const roleTone: Record<string, BadgeTone> = {
  admin: "purple",
  manager: "blue",
  technician: "green",
  requester: "gray",
};

const invTone: Record<string, BadgeTone> = {
  pending: "blue",
  accepted: "green",
  expired: "amber",
  revoked: "red",
};

export default async function UsersPage() {
  await requireRole("admin");
  const [users, invitations, org] = await Promise.all([
    listUsers(),
    listInvitations(),
    getOrgSettings(),
  ]);
  const tz = org.timezone;
  const open = invitations.filter(
    (i) => invitationDisplayStatus(i.inv) === "pending",
  );
  const history = invitations.filter(
    (i) => invitationDisplayStatus(i.inv) !== "pending",
  );

  return (
    <ListLayout className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Accounts are deactivated, never deleted — history stays intact."
        actions={
          <div className="flex gap-2">
            <ButtonLink href="/admin/users/invite">Invite user</ButtonLink>
            <ButtonLink href="/admin/users/new" variant="secondary">
              Add manually
            </ButtonLink>
          </div>
        }
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
                className="font-medium text-brand-800 hover:underline"
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
                {u.isActive ? (
                  <ConfirmSubmit
                    label="Deactivate"
                    title={`Deactivate ${u.displayName}?`}
                    body="They are signed out immediately and cannot sign in again until reactivated. Their history stays intact — accounts are never deleted."
                    variant="secondary"
                  />
                ) : (
                  <Button type="submit" variant="secondary">
                    Reactivate
                  </Button>
                )}
              </form>
            </div>
          </div>
        ))}
      </Card>

      <div>
        <h2 className="mb-2 font-semibold">Open invitations</h2>
        {open.length === 0 ? (
          <p className="text-sm text-gray-500">
            None — use <Link href="/admin/users/invite" className="text-brand-800 underline">Invite user</Link> to
            bring a coworker on board.
          </p>
        ) : (
          <Card className="divide-y divide-gray-100 p-0">
            {open.map(({ inv, invitedByName, teamName }) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{inv.displayName}</p>
                  <p className="text-sm text-gray-500">
                    {inv.email} · {inv.role}
                    {teamName ? ` · ${teamName}` : ""} · invited by {invitedByName}
                  </p>
                  <p className="text-xs text-gray-500">
                    Expires {formatDateTime(inv.expiresAt, tz)}
                    {inv.lastSentAt
                      ? ` · emailed ${formatDateTime(inv.lastSentAt, tz)}`
                      : " · not emailed (copy-link)"}
                    {inv.lastSendError ? ` · last email failed` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone="blue">pending</Badge>
                  <ReissueButton invitationId={inv.id} />
                  <RevokeButton invitationId={inv.id} />
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {history.length > 0 ? (
        <div>
          <h2 className="mb-2 font-semibold">Invitation history</h2>
          <Card className="divide-y divide-gray-100 p-0">
            {history.map(({ inv, invitedByName }) => {
              const status = invitationDisplayStatus(inv);
              return (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
                >
                  <p className="text-sm">
                    <span className="font-medium">{inv.email}</span>
                    <span className="text-gray-500">
                      {" "}
                      · {inv.role} · invited by {invitedByName} ·{" "}
                      {formatDateTime(inv.createdAt, tz)}
                    </span>
                  </p>
                  <div className="flex items-center gap-3">
                    <Badge tone={invTone[status]}>{status}</Badge>
                    {status === "expired" ? (
                      <ReissueButton invitationId={inv.id} />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
      ) : null}
    </ListLayout>
  );
}
