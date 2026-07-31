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
import { Badge, ButtonLink, Card } from "@/components/ui";
import { DetailLayout } from "@/components/layout";
import { ArrowLeft } from "@/components/icons";
import { AttachmentSection } from "@/components/attachments";
import { IMAGE_TYPES } from "@/server/storage";
import { WoPriorityBadge, WoStatusBadge } from "@/components/wo-badges";
import {
  ApprovalPanel,
  CommentForm,
  FieldActionBar,
  LaborForm,
  MeterReadingForm,
  PartsForm,
  PauseHoldForm,
  QuickStatusBar,
  RemovePartButton,
  TimerPanel,
} from "../wo-forms";
import { listMetersForAssets } from "@/server/services/meters";
import {
  bankedTimerMinutes,
  getActiveTimer,
  getWorkOrder,
  timerMinutes,
} from "@/server/services/workOrders";
import {
  AttachProcedureForm,
  ProcedureInstancePanel,
  type StepView,
} from "../procedure-panel";
import {
  isStepVisible,
  listInstancesForWo,
  listTemplates,
  type ProcedureStep,
  type ResponseValue,
} from "@/server/services/procedures";
import { listUsers } from "@/server/services/users";

export const metadata = { title: "Work order" };

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "" || value === "—") return null;
  // Label + value read left-to-right in adjacent columns — no eye travel
  // across a wide card.
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 py-1.5 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-sm font-semibold tracking-wide text-gray-900 uppercase">
      {children}
    </h2>
  );
}

function minutesLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** "2 × Oil filter" but "2.5 × Grease (lbs)" — trim trailing zeros. */
function qtyLabel(q: string): string {
  return String(Number(q));
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
  const woMeters = await listMetersForAssets(detail.assets.map((a) => a.asset.id));

  // Timer state: running here, running on another job, or paused with
  // banked minutes waiting to be resumed.
  const activeTimer = await getActiveTimer(user.id);
  const timerHere = activeTimer?.workOrderId === woId ? activeTimer : null;
  const otherTimerWo =
    activeTimer && activeTimer.workOrderId !== woId
      ? ((await getWorkOrder(activeTimer.workOrderId))?.woNumber ?? null)
      : null;
  const timerElapsed = timerHere
    ? timerMinutes(timerHere)
    : await bankedTimerMinutes(user.id, woId);
  const instances = await listInstancesForWo(woId);
  const templates = canManage ? await listTemplates() : [];
  const allUsers = await listUsers();
  const nameOf = (id: number) =>
    allUsers.find((u) => u.id === id)?.displayName ?? `user ${id}`;

  const woIsOpen = wo.status !== "completed" && wo.status !== "canceled";
  const panels = instances.map(({ instance, steps, responses }) => {
    const stepViews: StepView[] = (steps as ProcedureStep[]).map((s, i) => {
      const resp = responses.find((r) => r.stepIndex === i);
      const value = resp?.value as ResponseValue | undefined;
      return {
        index: i,
        type: s.type,
        label: s.label,
        instructions: s.instructions,
        expectedResult: s.expectedResult,
        required: s.required,
        min: s.min,
        max: s.max,
        options: s.options,
        visible: isStepVisible(steps, i, responses),
        answered: resp !== undefined,
        isFailure: resp?.isFailure ?? false,
        valueDisplay: value != null ? String(value.v) : null,
        comment: value?.comment ?? null,
        respondedByName: resp ? nameOf(resp.respondedBy) : undefined,
      };
    });
    return { instance, stepViews };
  });
  const overdue =
    wo.dueAt &&
    wo.dueAt < new Date() &&
    wo.status !== "completed" &&
    wo.status !== "canceled";

  return (
    <DetailLayout
      header={
        <div className="mb-4 space-y-3">
          <div>
            <Link
              href="/work-orders"
              className="mb-1 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-brand-800"
            >
              <ArrowLeft aria-hidden className="h-4 w-4" />
              Work orders
            </Link>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-bold sm:text-2xl">
                  {wo.woNumber} · {wo.title}
                </h1>
                {detail.site || detail.location ? (
                  <p className="text-sm text-gray-500">
                    {detail.site ? (
                      <Link
                        href={`/sites/${detail.site.id}`}
                        className="hover:text-brand-800 hover:underline"
                      >
                        {detail.site.name}
                      </Link>
                    ) : null}
                    {detail.location ? ` › ${detail.location.name}` : null}
                  </p>
                ) : null}
              </div>
              {canManage ? (
                <ButtonLink
                  href={`/work-orders/${wo.id}/edit`}
                  variant="secondary"
                >
                  Edit
                </ButtonLink>
              ) : undefined}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <WoStatusBadge status={wo.status} />
            <WoPriorityBadge priority={wo.priority} />
            <Badge tone="gray">{wo.workType}</Badge>
            {overdue ? <Badge tone="red">overdue</Badge> : null}
            {wo.flagged ? (
              <Badge tone="red">flagged — inspection failure</Badge>
            ) : null}
            {wo.tags?.map((t) => (
              <Badge key={t} tone="blue">
                {t}
              </Badge>
            ))}
          </div>

          {wo.status === "waiting_approval" && canManage ? (
            <Card className="border-purple-300 bg-purple-50">
              <ApprovalPanel workOrderId={wo.id} />
            </Card>
          ) : null}

          {canAct ? (
            // Desktop keeps the inline bar; phones get the sticky one below.
            <Card className="hidden md:block">
              <QuickStatusBar
                key={`qsb-${wo.status}-${wo.updatedAt.getTime()}`}
                workOrderId={wo.id}
                status={wo.status}
                canCancel={canManage}
              />
            </Card>
          ) : (
            <Card className="border-amber-200 bg-amber-50">
              <p className="text-sm text-amber-900">
                This work order is assigned to someone else — you can view it,
                but only the assignees or a manager can update it.
              </p>
            </Card>
          )}
        </div>
      }
      rail={
        <>
          {canAct && woIsOpen ? (
            <Card>
              <SectionTitle>Timer</SectionTitle>
              <TimerPanel
                workOrderId={wo.id}
                running={timerHere != null}
                elapsedMinutes={timerElapsed}
                runningElsewhere={otherTimerWo}
              />
              <div className="mt-3 border-t border-gray-100 pt-3">
                <PauseHoldForm
                  key={`ph-${wo.status}-${wo.updatedAt.getTime()}`}
                  workOrderId={wo.id}
                  status={wo.status}
                />
              </div>
            </Card>
          ) : null}

          {canAct ? (
            <Card>
              <SectionTitle>Log labor time</SectionTitle>
              <LaborForm key={`l-${detail.labor.length}`} workOrderId={wo.id} />
              {detail.labor.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-gray-100 pt-2">
                  {detail.labor.map(({ entry, userName }) => (
                    <li key={entry.id} className="text-sm">
                      <span className="font-medium">
                        {minutesLabel(entry.minutes)}
                      </span>
                      <span className="text-gray-500">
                        {" "}
                        — {userName}
                        {entry.workDate
                          ? ` · ${formatDate(entry.workDate, tz)}`
                          : ""}
                        {entry.note ? ` · ${entry.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}

          {canAct || detail.parts.length > 0 ? (
            <Card>
              <SectionTitle>Parts &amp; materials used</SectionTitle>
              {detail.parts.length === 0 ? (
                <p className="mb-2 text-sm text-gray-500">
                  Nothing documented yet.
                </p>
              ) : (
                <ul className="mb-2 space-y-1">
                  {detail.parts.map(({ entry, userName }) => {
                    const cost =
                      entry.unitCost != null ? Number(entry.unitCost) : null;
                    return (
                      <li
                        key={entry.id}
                        className="flex items-start justify-between gap-2 text-sm"
                      >
                        <span>
                          <span className="font-medium">
                            {qtyLabel(entry.quantity)} × {entry.name}
                          </span>
                          <span className="text-gray-500">
                            {cost != null
                              ? ` — ${money(Number(entry.quantity) * cost)}`
                              : ""}
                            {` · ${userName}`}
                          </span>
                        </span>
                        {canAct ? (
                          <RemovePartButton
                            workOrderId={wo.id}
                            partId={entry.id}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              {detail.partsCostTotal > 0 ? (
                <p className="mb-2 border-t border-gray-100 pt-2 text-sm font-semibold">
                  Parts total: {money(detail.partsCostTotal)}
                </p>
              ) : null}
              {canAct && woIsOpen ? (
                <PartsForm key={`p-${detail.parts.length}`} workOrderId={wo.id} />
              ) : null}
            </Card>
          ) : null}

          {canAct && woMeters.length > 0 ? (
            <Card id="readings">
              <SectionTitle>Meter readings</SectionTitle>
              <p className="mb-3 text-xs text-gray-500">
                Record the current hours / miles / fuel while at the machine.
                Readings save to the meter&apos;s history.
              </p>
              <div className="space-y-4">
                {woMeters.map(({ meter, assetNumber }) => (
                  <div key={meter.id}>
                    <p className="text-sm font-medium">
                      <Link
                        href={`/meters/${meter.id}`}
                        className="text-brand-800 hover:underline"
                      >
                        {meter.name}
                      </Link>{" "}
                      <span className="text-gray-400">({assetNumber})</span>
                    </p>
                    <p className="mb-1 text-xs text-gray-500">
                      {meter.currentValue != null
                        ? `Last: ${Number(meter.currentValue)} ${meter.unit}${
                            meter.currentReadingAt
                              ? ` on ${formatDate(meter.currentReadingAt, tz)}`
                              : ""
                          }`
                        : "No readings yet"}
                    </p>
                    <MeterReadingForm
                      key={`mr-${meter.id}-${meter.currentValue ?? "none"}`}
                      workOrderId={wo.id}
                      meterId={meter.id}
                      unit={meter.unit}
                      mustIncrease={meter.mustIncrease}
                      lastValue={
                        meter.currentValue != null
                          ? String(Number(meter.currentValue))
                          : null
                      }
                    />
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <SectionTitle>Status history</SectionTitle>
            <ol className="relative ml-1.5 space-y-3 border-l border-gray-200 pl-4">
              {detail.history.map(({ entry, changedByName }) => (
                <li key={entry.id} className="relative text-sm">
                  <span
                    aria-hidden
                    className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-400"
                  />
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
            </ol>
          </Card>
        </>
      }
    >
      <Card>
        <SectionTitle>Details</SectionTitle>
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
            value={
              wo.plannedStartAt ? formatDateTime(wo.plannedStartAt, tz) : null
            }
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
            value={
              wo.estimatedMinutes != null
                ? minutesLabel(wo.estimatedMinutes)
                : null
            }
          />
          <InfoRow
            label="Actual labor"
            value={detail.laborTotal > 0 ? minutesLabel(detail.laborTotal) : null}
          />
          <InfoRow
            label="Parts cost"
            value={
              detail.partsCostTotal > 0 ? money(detail.partsCostTotal) : null
            }
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
                  className="text-brand-800 hover:underline"
                >
                  {detail.parent.woNumber} · {detail.parent.title}
                </Link>
              ) : null
            }
          />
          <InfoRow
            label="Source"
            value={wo.source !== "manual" ? wo.source : null}
          />
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
          <SectionTitle>Assets</SectionTitle>
          <ul className="space-y-1">
            {detail.assets.map(({ link, asset }) => (
              <li
                key={asset.id}
                className="flex items-center justify-between text-sm"
              >
                <Link
                  href={`/assets/${asset.id}`}
                  className="text-brand-800 hover:underline"
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
          <SectionTitle>Sub-work orders</SectionTitle>
          <ul className="space-y-1">
            {detail.children.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between text-sm"
              >
                <Link
                  href={`/work-orders/${c.id}`}
                  className="text-brand-800 hover:underline"
                >
                  {c.woNumber} · {c.title}
                </Link>
                <WoStatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {panels.length > 0 || (canManage && woIsOpen && templates.length > 0) ? (
        <Card>
          <SectionTitle>Procedures</SectionTitle>
          <div className="space-y-5">
            {panels.map(({ instance, stepViews }) => (
              <ProcedureInstancePanel
                key={instance.id}
                workOrderId={wo.id}
                instanceId={instance.id}
                name={instance.name}
                version={instance.templateVersion}
                steps={stepViews}
                canAct={canAct && woIsOpen}
              />
            ))}
            {canManage && woIsOpen ? (
              <AttachProcedureForm
                workOrderId={wo.id}
                templates={templates
                  .filter((t) => t.isActive && t.currentVersion > 0)
                  .map((t) => ({
                    id: t.id,
                    name: t.name,
                    version: t.currentVersion,
                  }))}
              />
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card id="pictures">
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

      <Card id="notes">
        <SectionTitle>Comments</SectionTitle>
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
        {canAct ? (
          <CommentForm key={`c-${detail.comments.length}`} workOrderId={wo.id} />
        ) : null}
      </Card>

      {canAct ? (
        <>
          {/* Spacer so the sticky bar never covers the last card. */}
          <div className="h-20 md:hidden" aria-hidden />
          <FieldActionBar
            key={`fab-${wo.status}-${wo.updatedAt.getTime()}`}
            workOrderId={wo.id}
            status={wo.status}
            canComplete={woIsOpen}
          />
        </>
      ) : null}
    </DetailLayout>
  );
}
