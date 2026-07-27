import { requireUser } from "@/server/auth/guards";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Signed in as ${user.displayName} (${user.role})`}
      />
      <Card>
        <p className="text-sm text-gray-600">
          Work orders, assigned work, and maintenance summaries appear here as
          those modules come online in the next phases.
        </p>
      </Card>
    </div>
  );
}
