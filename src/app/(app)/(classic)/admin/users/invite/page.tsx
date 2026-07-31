import { requireRole } from "@/server/auth/guards";
import { listTeams } from "@/server/services/teams";
import { Card, PageHeader } from "@/components/ui";
import { emailConfigured } from "@/server/email";
import { InviteUserForm } from "../invite-forms";

export const metadata = { title: "Invite user" };
export const dynamic = "force-dynamic";

export default async function InviteUserPage() {
  await requireRole("admin");
  const teams = await listTeams();
  const canEmail = emailConfigured();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Invite a coworker"
        subtitle="They get a one-time link to set their own password — you never handle it."
      />
      {!canEmail ? (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-900">
            Email isn&apos;t configured (SMTP settings are empty), so
            invitations won&apos;t be emailed automatically — you&apos;ll get
            a link to copy and send by text or another approved method. The
            link works exactly the same way.
          </p>
        </Card>
      ) : null}
      <Card>
        <InviteUserForm
          teams={teams
            .filter((t) => t.isActive)
            .map((t) => ({ id: t.id, name: t.name }))}
        />
      </Card>
    </div>
  );
}
