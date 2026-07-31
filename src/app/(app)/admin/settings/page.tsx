import { requireRole } from "@/server/auth/guards";
import { readOrgSettings } from "@/server/services/org";
import { Card, PageHeader, StatusMessage } from "@/components/ui";
import { FormLayout } from "@/components/layout";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Organization settings" };
// Must always show the live values — never a prerendered snapshot.
export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireRole("admin");
  const [org, params] = await Promise.all([readOrgSettings(), searchParams]);
  const timezones = Intl.supportedValuesOf("timeZone");

  return (
    <FormLayout>
      <PageHeader
        title="Organization settings"
        subtitle="Name, timezone, and how work gets signed off."
      />
      {params.saved === "1" ? (
        <StatusMessage className="mb-4" data-testid="settings-saved">
          Settings saved.
        </StatusMessage>
      ) : null}
      <Card>
        <SettingsForm
          timezones={timezones}
          current={{
            name: org.name,
            timezone: org.timezone,
            requireCompletionApproval: org.requireCompletionApproval,
          }}
        />
      </Card>
    </FormLayout>
  );
}
