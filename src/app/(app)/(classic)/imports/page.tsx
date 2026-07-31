import Link from "next/link";
import { requireRole } from "@/server/auth/guards";
import { listJobs } from "@/server/services/imports";
import { getOrgSettings } from "@/server/services/org";
import { formatDateTime } from "@/lib/format";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";

export const metadata = { title: "Imports" };

const TONES: Record<string, BadgeTone> = {
  mapping: "gray",
  validated: "blue",
  running: "amber",
  completed: "green",
  failed: "red",
  rolled_back: "purple",
};

export default async function ImportsPage() {
  await requireRole("admin");
  const jobs = await listJobs();
  const org = await getOrgSettings();
  return (
    <div>
      <PageHeader
        title="Bulk imports"
        subtitle="Import work orders from CSV or XLSX with validation, dry-run, and rollback."
        actions={<ButtonLink href="/imports/new">New import</ButtonLink>}
      />
      {jobs.length === 0 ? (
        <EmptyState
          title="No imports yet"
          hint="Upload a spreadsheet of work orders to bring history in."
          action={<ButtonLink href="/imports/new">New import</ButtonLink>}
        />
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {jobs.map(({ job, userName }) => (
            <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <Link
                  href={`/imports/${job.id}`}
                  className="font-medium text-brand-800 hover:underline"
                >
                  #{job.id} · {job.filename}
                </Link>
                <p className="text-sm text-gray-500">
                  {job.totalRows} rows · {userName} ·{" "}
                  {formatDateTime(job.createdAt, org.timezone)}
                  {job.status === "completed"
                    ? ` · ${job.createdCount} created, ${job.updatedCount} updated, ${job.skippedCount} skipped, ${job.failedCount} failed`
                    : ""}
                </p>
              </div>
              <Badge tone={TONES[job.status] ?? "gray"}>{job.status.replace("_", " ")}</Badge>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
