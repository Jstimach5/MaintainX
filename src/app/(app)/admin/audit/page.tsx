import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { requireRole } from "@/server/auth/guards";
import { db } from "@/server/db";
import { auditEvents, users } from "@/server/db/schema";
import { getOrgSettings } from "@/server/services/org";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

/**
 * Append-only audit browser (§14). Read-only by design — there is no
 * update or delete path for audit_events anywhere in the application.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    entity?: string;
    action?: string;
    user?: string;
    from?: string;
    to?: string;
  }>;
}) {
  await requireRole("admin");
  const params = await searchParams;
  const org = await getOrgSettings();

  const conds = [];
  if (params.entity) conds.push(eq(auditEvents.entityType, params.entity));
  if (params.action) {
    conds.push(sql`${auditEvents.action} LIKE ${params.action + "%"}`);
  }
  if (params.user && Number.isInteger(Number(params.user))) {
    conds.push(eq(auditEvents.userId, Number(params.user)));
  }
  if (params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from)) {
    conds.push(gte(auditEvents.createdAt, new Date(`${params.from}T00:00:00Z`)));
  }
  if (params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to)) {
    conds.push(lte(auditEvents.createdAt, new Date(`${params.to}T23:59:59Z`)));
  }

  const [rows, entityTypes, allUsers] = await Promise.all([
    db
      .select({ event: auditEvents, userName: users.displayName })
      .from(auditEvents)
      .leftJoin(users, eq(auditEvents.userId, users.id))
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(desc(auditEvents.createdAt))
      .limit(200),
    db
      .selectDistinct({ entityType: auditEvents.entityType })
      .from(auditEvents),
    db.select({ id: users.id, displayName: users.displayName }).from(users),
  ]);

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="Append-only record of every important action. Newest first, capped at 200 rows per view — narrow with the filters."
      />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <select name="entity" defaultValue={params.entity ?? ""} className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-base">
          <option value="">All record types</option>
          {entityTypes.map((t) => (
            <option key={t.entityType} value={t.entityType}>
              {t.entityType.replace("_", " ")}
            </option>
          ))}
        </select>
        <input
          name="action"
          defaultValue={params.action ?? ""}
          placeholder="Action prefix, e.g. work_order."
          className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-base"
        />
        <select name="user" defaultValue={params.user ?? ""} className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-base">
          <option value="">Anyone (incl. system)</option>
          {allUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName}
            </option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={params.from ?? ""} className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-base" />
        <input type="date" name="to" defaultValue={params.to ?? ""} className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-base" />
        <button type="submit" className="min-h-11 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
          Filter
        </button>
      </form>
      <Card className="divide-y divide-gray-100 p-0">
        {rows.map(({ event, userName }) => (
          <div key={event.id} className="px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="gray">{event.entityType.replace("_", " ")} #{event.entityId}</Badge>
              <span className="font-mono text-xs text-gray-500">{event.action}</span>
              {event.source !== "web" ? <Badge tone="blue">{event.source}</Badge> : null}
            </div>
            <p className="mt-0.5 text-sm">{event.summary ?? "—"}</p>
            <p className="text-xs text-gray-400">
              {userName ?? "system"} · {formatDateTime(event.createdAt, org.timezone)}
            </p>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No events match.</p>
        ) : null}
      </Card>
    </div>
  );
}
