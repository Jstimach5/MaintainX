import { requireRole } from "@/server/auth/guards";
import { Card, PageHeader } from "@/components/ui";
import { CreateUserForm } from "../user-forms";

export const metadata = { title: "Add user" };

export default async function NewUserPage() {
  await requireRole("admin");
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Add user" />
      <Card>
        <CreateUserForm />
      </Card>
    </div>
  );
}
