import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { getUser } from "@/server/services/users";
import { Card, PageHeader } from "@/components/ui";
import { EditUserForm, ResetPasswordForm } from "../user-forms";

export const metadata = { title: "Edit user" };

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("admin");
  const { id } = await params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) notFound();
  const user = await getUser(userId);
  if (!user) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title={`Edit: ${user.displayName}`} />
      <Card>
        {/* Pass only safe fields — never the full row (it carries password_hash). */}
        <EditUserForm
          user={{
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            email: user.email,
            role: user.role,
          }}
        />
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Reset password</h2>
        <ResetPasswordForm userId={user.id} />
      </Card>
    </div>
  );
}
