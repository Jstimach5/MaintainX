import { requireRole } from "@/server/auth/guards";
import { readOrgSettings } from "@/server/services/org";
import { Card, PageHeader } from "@/components/ui";
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
    <div>
      <PageHeader
        title="Organization settings"
        subtitle="Name, timezone, and how work gets signed off."
      />
      {params.saved === "1" ? (
        <p
          className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-800"
          data-testid="settings-saved"
        >
          Settings saved.
        </p>
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
    </div>
  );
}
