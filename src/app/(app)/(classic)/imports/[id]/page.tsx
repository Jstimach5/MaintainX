import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { requireRole } from "@/server/auth/guards";
import { db } from "@/server/db";
import { importRows } from "@/server/db/schema";
import {
  IMPORT_FIELDS,
  getJob,
  listMappingTemplates,
} from "@/server/services/imports";
import { Badge, Card, PageHeader } from "@/components/ui";
import { MappingForm } from "../import-forms";
import { rollbackImportAction, startImportAction } from "../actions";

export const metadata = { title: "Import" };
export const dynamic = "force-dynamic";

export default async function ImportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("admin");
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) notFound();
  const job = await getJob(jobId);
  if (!job) notFound();
  const templates = await listMappingTemplates();

  const issueRows =
    job.status !== "mapping"
      ? await db
          .select()
          .from(importRows)
          .where(
            and(
              eq(importRows.jobId, jobId),
              inArray(importRows.status, ["error", "warning", "failed"]),
            ),
          )
          .orderBy(importRows.rowNumber)
          .limit(25)
      : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {job.status === "running" ? (
        // Poll while the background import runs.
        <meta httpEquiv="refresh" content="2" />
      ) : null}
      <PageHeader
        title={`Import #${job.id} · ${job.filename}`}
        subtitle={`${job.totalRows} rows · status: ${job.status.replace("_", " ")}`}
      />

      {job.status === "mapping" ? (
        <Card>
          <h2 className="mb-2 font-semibold">Step 2 of 3 — map the columns</h2>
          <MappingForm
            jobId={job.id}
            headers={job.headers as string[]}
            initialMapping={(job.mapping as Record<string, string>) ?? {}}
            fields={IMPORT_FIELDS.map((f) => ({ key: f.key, label: f.label }))}
            templates={templates.map((t) => ({
              name: t.name,
              mapping: t.mapping as Record<string, string>,
            }))}
            strategy={job.strategy}
          />
        </Card>
      ) : null}

      {job.status === "validated" ? (
        <Card>
          <h2 className="mb-2 font-semibold">Step 3 of 3 — dry-run preview</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone="green">{job.validRows} valid</Badge>
            <Badge tone="amber">{job.warningRows} with warnings</Badge>
            <Badge tone="red">{job.errorRows} rejected</Badge>
          </div>
          <p className="mb-3 text-sm text-gray-600">
            Importing writes the {job.validRows + job.warningRows} valid/warning
            rows. Rejected rows are never written — download the issue list,
            fix the file, and re-upload if needed. Nothing has been imported
            yet.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={startImportAction}>
              <input type="hidden" name="jobId" value={job.id} />
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
              >
                Start import ({job.validRows + job.warningRows} rows)
              </button>
            </form>
            <a
              href={`/imports/${job.id}/issues.csv`}
              className="inline-flex min-h-11 items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
            >
              Download issues CSV
            </a>
          </div>
        </Card>
      ) : null}

      {job.status === "running" ? (
        <Card>
          <h2 className="mb-2 font-semibold">Importing…</h2>
          <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-blue-700 transition-all"
              style={{
                width: `${job.totalRows > 0 ? Math.round((job.processedRows / (job.validRows + job.warningRows || 1)) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="mt-2 text-sm text-gray-600">
            {job.processedRows} of {job.validRows + job.warningRows} rows
            processed — this page refreshes automatically.
          </p>
        </Card>
      ) : null}

      {job.status === "completed" || job.status === "rolled_back" || job.status === "failed" ? (
        <Card>
          <h2 className="mb-2 font-semibold">Result</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone="green">{job.createdCount} created</Badge>
            <Badge tone="blue">{job.updatedCount} updated</Badge>
            <Badge tone="gray">{job.skippedCount} skipped</Badge>
            <Badge tone="red">{job.failedCount + job.errorRows} rejected/failed</Badge>
          </div>
          {job.error ? <p className="mb-2 text-sm text-red-700">{job.error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <a
              href={`/imports/${job.id}/issues.csv`}
              className="inline-flex min-h-11 items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
            >
              Download issues CSV
            </a>
            {job.status === "completed" && job.createdCount > 0 ? (
              <form action={rollbackImportAction}>
                <input type="hidden" name="jobId" value={job.id} />
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
                >
                  Roll back this import
                </button>
              </form>
            ) : null}
          </div>
          {job.status === "rolled_back" ? (
            <p className="mt-2 text-sm text-gray-600">
              Rolled back. Work orders that had been edited since the import
              were kept; untouched ones were removed.
            </p>
          ) : null}
        </Card>
      ) : null}

      {issueRows.length > 0 ? (
        <Card>
          <h2 className="mb-2 font-semibold">
            Issues (first {issueRows.length})
          </h2>
          <ul className="space-y-1 text-sm">
            {issueRows.map((r) => (
              <li key={r.id}>
                <Badge tone={r.status === "warning" ? "amber" : "red"}>
                  row {r.rowNumber}
                </Badge>{" "}
                <span className="text-gray-700">
                  {(r.messages ?? []).join("; ")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
