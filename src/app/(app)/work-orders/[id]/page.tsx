import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import {
  canActOnWorkOrder,
  getWorkOrderDetail,
  woStatusLabel,
} from "@/server/services/workOrders";
import { listAttachments } from "@/server/services/attachments";
import { getOrgSettings } from "@/server/services/org";
import { formatDate, formatDateTime } from "@/lib/format";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { AttachmentSection } from "@/components/attachments";
import { IMAGE_TYPES } from "@/server/storage";
import { WoPriorityBadge, WoStatusBadge } from "../wo-badges";
import { CommentForm, LaborForm, QuickStatusBar } from "../wo-forms";

export const metadata = { title: "Work order" };

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function minutesLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("admin", "manager", "technician");
  const { id } = await params;
  const woId = Number(id);
  if (!Number.isInteger(woId)) notFound();
  const detail = await getWorkOrderDetail(woId);
  if (!detail) notFound();
  const { wo } = detail;
  const org = await getOrgSettings();
  const tz = org.timezone;
  const attachments = await listAttachments("work_order", woId);
  const canManage = user.role === "admin" || user.role === "manager";
  const canAct = await canActOnWorkOrder(user, woId);
  const overdue =
    wo.dueAt &&
    wo.dueAt < new Date() &&
    wo.status !== "completed" &&
    wo.status !== "canceled";

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${wo.woNumber} · ${wo.title}`}
        subtitle={[detail.site?.name, detail.location?.name]
          .filter(Boolean)
          .join(" › ")}
        actions={
          canManage ? (
            <ButtonLink href={`/work-orders/${wo.id}/edit`} variant="secondary">
              Edit
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <WoStatusBadge status={wo.status} />
        <WoPriorityBadge priority={wo.priority} />
        <Badge tone="gray">{wo.workType}</Badge>
        {overdue ? <Badge tone="red">overdue</Badge> : null}
        {wo.tags?.map((t) => (
          <Badge key={t} tone="blue">
            {t}
          </Badge>
        ))}
      </div>

      {canAct ? (
        <Card>
          <QuickStatusBar
            workOrderId={wo.id}
            status={wo.status}
            canCancel={canManage}
          />
        </Card>
      ) : (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-900">
            This work order is assigned to someone else — you can view it, but
            only the assignees or a manager can update it.
          </p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <h2 className="mb-1 font-semibold">Details</h2>
            {wo.description ? (
              <p className="mb-2 text-sm whitespace-pre-wrap">{wo.description}</p>
            ) : null}
            <dl className="divide-y divide-gray-100">
              <InfoRow
                label="Assigned to"
                value={
                  detail.assignments.length > 0
                    ? detail.assignments.map((a) => a.displayName).join(", ")
                    : null
                }
              />
              <InfoRow label="Team" value={detail.team?.name} />
              <InfoRow label="Requested by" value={detail.requester?.displayName} />
              <InfoRow
                label="Planned start"
                value={wo.plannedStartAt ? formatDateTime(wo.plannedStartAt, tz) : null}
              />
              <InfoRow
                label="Due"
                value={
                  wo.dueAt ? (
                    <span className={overdue ? "text-red-600" : ""}>
                      {formatDateTime(wo.dueAt, tz)}
                    </span>
                  ) : null
                }
              />
              <InfoRow
                label="Started"
                value={wo.actualStartAt ? formatDateTime(wo.actualStartAt, tz) : null}
              />
              <InfoRow
                label="Completed"
                value={wo.completedAt ? formatDateTime(wo.completedAt, tz) : null}
              />
              <InfoRow
                label="Estimated time"
                value={wo.estimatedMinutes != null ? minutesLabel(wo.estimatedMinutes) : null}
              />
              <InfoRow
                label="Actual labor"
                value={detail.laborTotal > 0 ? minutesLabel(detail.laborTotal) : null}
              />
              <InfoRow
                label="Planned downtime"
                value={
                  wo.plannedDowntimeMinutes != null
                    ? minutesLabel(wo.plannedDowntimeMinutes)
                    : null
                }
              />
              <InfoRow
                label="Actual downtime"
                value={
                  wo.actualDowntimeMinutes != null
                    ? minutesLabel(wo.actualDowntimeMinutes)
                    : null
                }
              />
              <InfoRow
                label="Parent work order"
                value={
                  detail.parent ? (
                    <Link
                      href={`/work-orders/${detail.parent.id}`}
                      className="text-blue-700 hover:underline"
                    >
                      {detail.parent.woNumber} · {detail.parent.title}
                    </Link>
                  ) : null
                }
              />
              <InfoRow label="Source" value={wo.source !== "manual" ? wo.source : null} />
              <InfoRow label="Created by" value={detail.creator?.displayName} />
              <InfoRow label="Created" value={formatDateTime(wo.createdAt, tz)} />
            </dl>
            {wo.completionNotes ? (
              <div className="mt-3 rounded-md bg-green-50 p-3">
                <p className="text-xs font-semibold text-green-800 uppercase">
                  Completion notes
                </p>
                <p className="text-sm whitespace-pre-wrap">{wo.completionNotes}</p>
              </div>
            ) : null}
          </Card>

          {detail.assets.length > 0 ? (
            <Card>
              <h2 className="mb-2 font-semibold">Assets</h2>
              <ul className="space-y-1">
                {detail.assets.map(({ link, asset }) => (
                  <li key={asset.id} className="flex items-center justify-between text-sm">
                    <Link
                      href={`/assets/${asset.id}`}
                      className="text-blue-700 hover:underline"
                    >
                      {asset.assetNumber} · {asset.name}
                    </Link>
                    {link.isPrimary && detail.assets.length > 1 ? (
                      <Badge tone="blue">primary</Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {detail.children.length > 0 ? (
            <Card>
              <h2 className="mb-2 font-semibold">Sub-work orders</h2>
              <ul className="space-y-1">
                {detail.children.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <Link
                      href={`/work-orders/${c.id}`}
                      className="text-blue-700 hover:underline"
                    >
                      {c.woNumber} · {c.title}
                    </Link>
                    <WoStatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <AttachmentSection
              entityType="work_order"
              entityId={wo.id}
              canUpload={canAct}
              attachments={attachments.map((a) => ({
                id: a.id,
                category: a.category,
                originalName: a.originalName,
                mimeType: a.mimeType,
                caption: a.caption,
                createdAt: formatDateTime(a.createdAt, tz),
                isImage: IMAGE_TYPES.has(a.mimeType),
              }))}
            />
          </Card>

          <Card>
            <h2 className="mb-2 font-semibold">Comments</h2>
            {detail.comments.length === 0 ? (
              <p className="mb-3 text-sm text-gray-500">No comments yet.</p>
            ) : (
              <ul className="mb-3 space-y-3">
                {detail.comments.map(({ comment, authorName }) => (
                  <li key={comment.id} className="rounded-md bg-gray-50 p-3">
                    <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {authorName} · {formatDateTime(comment.createdAt, tz)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {canAct ? <CommentForm workOrderId={wo.id} /> : null}
          </Card>
        </div>

        <div className="space-y-4">
          {canAct ? (
            <Card>
              <h2 className="mb-2 font-semibold">Log labor time</h2>
              <LaborForm workOrderId={wo.id} />
              {detail.labor.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-gray-100 pt-2">
                  {detail.labor.map(({ entry, userName }) => (
                    <li key={entry.id} className="text-sm">
                      <span className="font-medium">{minutesLabel(entry.minutes)}</span>
                      <span className="text-gray-500">
                        {" "}
                        — {userName}
                        {entry.workDate ? ` · ${formatDate(entry.workDate, tz)}` : ""}
                        {entry.note ? ` · ${entry.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <h2 className="mb-2 font-semibold">Status history</h2>
            <ul className="space-y-2">
              {detail.history.map(({ entry, changedByName }) => (
                <li key={entry.id} className="text-sm">
                  <span className="font-medium">
                    {entry.previousStatus
                      ? `${woStatusLabel(entry.previousStatus)} → `
                      : ""}
                    {woStatusLabel(entry.status)}
                  </span>
                  {entry.note ? (
                    <span className="text-gray-600"> — {entry.note}</span>
                  ) : null}
                  <br />
                  <span className="text-gray-400">
                    {changedByName} · {formatDateTime(entry.createdAt, tz)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
