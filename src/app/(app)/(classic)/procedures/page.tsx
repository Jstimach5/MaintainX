import Link from "next/link";
import { requireRole } from "@/server/auth/guards";
import { listTemplates } from "@/server/services/procedures";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Procedures" };

export default async function ProceduresPage() {
  await requireRole("admin", "manager");
  const templates = await listTemplates();
  return (
    <div>
      <PageHeader
        title="Procedures"
        subtitle="Reusable checklists attached to work orders. Edits create new versions; past work keeps its snapshot."
        actions={<ButtonLink href="/procedures/new">New procedure</ButtonLink>}
      />
      {templates.length === 0 ? (
        <EmptyState
          title="No procedures yet"
          hint="Build a checklist once, attach it to any work order."
          action={<ButtonLink href="/procedures/new">New procedure</ButtonLink>}
        />
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/procedures/${t.id}`}
                  className="font-medium text-blue-800 hover:underline"
                >
                  {t.name}
                </Link>
                <p className="text-sm text-gray-500">
                  v{t.currentVersion}
                  {t.description ? ` · ${t.description}` : ""}
                </p>
              </div>
              {!t.isActive ? <Badge tone="red">inactive</Badge> : null}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
