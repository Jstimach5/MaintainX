import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { comments, users } from "@/server/db/schema";
import {
  REQUEST_STATUSES,
  getRequestDetail,
  requestStatusLabel,
} from "@/server/services/requests";
import { listAttachments } from "@/server/services/attachments";
import { getOrgSettings } from "@/server/services/org";
import { formatDate, formatDateTime } from "@/lib/format";
import { Badge, Breadcrumb, Card } from "@/components/ui";
import { DetailLayout } from "@/components/layout";
import { ArrowLeft } from "@/components/icons";
import type { BadgeTone } from "@/components/ui";
import { AttachmentSection } from "@/components/attachments";
import { IMAGE_TYPES } from "@/server/storage";
import { DecisionBar, RequestCommentForm } from "../request-forms";
import { WoStatusBadge } from "@/components/wo-badges";

export const metadata = { title: "Request" };

const TONES: Record<string, BadgeTone> = Object.fromEntries(
  REQUEST_STATUSES.map((s) => [s.value, s.tone]),
);

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
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

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) notFound();
  const detail = await getRequestDetail(requestId);
  if (!detail) notFound();
  const { request } = detail;

  const isReviewer = user.role === "admin" || user.role === "manager";
  const isOwner = request.requesterId === user.id;
  // Requesters/technicians may only see their own requests.
  if (!isReviewer && !isOwner) notFound();

  const org = await getOrgSettings();
  const tz = org.timezone;
  const attachments = await listAttachments("request", requestId);
  const commentRows = await db
    .select({ comment: comments, authorName: users.displayName })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(and(eq(comments.entityType, "request"), eq(comments.entityId, requestId)))
    .orderBy(asc(comments.createdAt));
  // Internal notes are for reviewers only (§8).
  const visibleComments = commentRows.filter(
    (c) => isReviewer || !c.comment.isInternal,
  );

  return (
    <DetailLayout
      header={
        <div className="mb-4 space-y-3">
          <div>
            <Link
              href="/requests"
              className="mb-1 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-brand-800"
            >
              <ArrowLeft aria-hidden className="h-4 w-4" />
              Requests
            </Link>
            <h1 className="text-xl font-bold sm:text-2xl">
              {request.requestNumber} · {request.title}
            </h1>
            <Breadcrumb
              items={[
                ...(detail.siteName ? [{ label: detail.siteName }] : []),
                ...(detail.locationName ? [{ label: detail.locationName }] : []),
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TONES[request.status] ?? "gray"}>
              {requestStatusLabel(request.status)}
            </Badge>
            {request.priority !== "none" ? (
              <Badge
                tone={
                  request.priority === "critical"
                    ? "red"
                    : request.priority === "high"
                      ? "amber"
                      : "gray"
                }
              >
                {request.priority}
              </Badge>
            ) : null}
            {request.source !== "internal" ? (
              <Badge tone="blue">{request.source}</Badge>
            ) : null}
          </div>
        </div>
      }
      rail={
        <>
          {isReviewer && request.status !== "converted" ? (
            <Card>
              <SectionTitle>Decision</SectionTitle>
              <DecisionBar requestId={request.id} status={request.status} />
            </Card>
          ) : null}
          <Card>
            <SectionTitle>Progress</SectionTitle>
            <ol className="relative ml-1.5 space-y-3 border-l border-gray-200 pl-4 text-sm">
              {REQUEST_STATUSES.filter((s) =>
                ["submitted", "under_review", "approved", "converted"].includes(
                  s.value,
                ),
              ).map((s) => {
                const reached =
                  ["submitted", "under_review", "approved", "converted"].indexOf(
                    request.status,
                  ) >=
                  ["submitted", "under_review", "approved", "converted"].indexOf(
                    s.value,
                  );
                const current = request.status === s.value;
                return (
                  <li key={s.value} className="relative">
                    <span
                      aria-hidden
                      className={`absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-white ${
                        reached ? "bg-brand-600" : "bg-gray-300"
                      }`}
                    />
                    <span
                      className={
                        current
                          ? "font-semibold text-brand-900"
                          : reached
                            ? "text-gray-700"
                            : "text-gray-400"
                      }
                    >
                      {s.label}
                      {current ? " — now" : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
            {request.status === "declined" || request.status === "canceled" ? (
              <p className="mt-3 border-t border-gray-100 pt-3 text-sm font-medium text-red-700">
                {requestStatusLabel(request.status)}
              </p>
            ) : null}
          </Card>
        </>
      }
    >
      {request.status === "declined" && request.declineReason ? (
        <Card className="border-red-200 bg-red-50">
          <p className="text-sm text-red-800">
            <strong>Declined:</strong> {request.declineReason}
          </p>
        </Card>
      ) : null}

      {detail.convertedWo ? (
        <Card className="border-purple-200 bg-purple-50">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            Converted to{" "}
            {isReviewer || user.role === "technician" ? (
              <Link
                href={`/work-orders/${detail.convertedWo.id}`}
                className="font-medium text-brand-800 hover:underline"
              >
                {detail.convertedWo.woNumber} · {detail.convertedWo.title}
              </Link>
            ) : (
              <span className="font-medium">{detail.convertedWo.woNumber}</span>
            )}
            <WoStatusBadge status={detail.convertedWo.status} />
          </p>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Details</SectionTitle>
        {request.description ? (
          <p className="mb-2 text-sm whitespace-pre-wrap">{request.description}</p>
        ) : null}
        <dl className="divide-y divide-gray-100">
          <InfoRow
            label="Requested by"
            value={detail.requesterDisplay ?? request.requesterName ?? "anonymous"}
          />
          <InfoRow label="Contact" value={request.requesterContact} />
          <InfoRow label="Location" value={detail.locationName} />
          <InfoRow label="Asset" value={detail.assetName} />
          <InfoRow label="Category" value={request.category} />
          <InfoRow
            label="Needed by"
            value={
              request.requestedCompletionDate
                ? formatDate(request.requestedCompletionDate, tz)
                : null
            }
          />
          <InfoRow label="Submitted" value={formatDateTime(request.createdAt, tz)} />
          {detail.originWo && isReviewer ? (
            <InfoRow
              label="From inspection on"
              value={
                <Link
                  href={`/work-orders/${detail.originWo.id}`}
                  className="text-brand-800 hover:underline"
                >
                  {detail.originWo.woNumber}
                </Link>
              }
            />
          ) : null}
        </dl>
      </Card>

      <Card>
        <AttachmentSection
          entityType="request"
          entityId={request.id}
          canUpload={
            (isOwner || isReviewer || user.role === "technician") &&
            request.status !== "converted" &&
            request.status !== "declined"
          }
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
        <SectionTitle>Comments</SectionTitle>
        {visibleComments.length === 0 ? (
          <p className="mb-3 text-sm text-gray-500">No comments yet.</p>
        ) : (
          <ul className="mb-3 space-y-3">
            {visibleComments.map(({ comment, authorName }) => (
              <li
                key={comment.id}
                className={`rounded-md p-3 ${comment.isInternal ? "border border-amber-200 bg-amber-50" : "bg-gray-50"}`}
              >
                {comment.isInternal ? (
                  <p className="text-xs font-semibold text-amber-700 uppercase">
                    Internal note
                  </p>
                ) : null}
                <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {authorName} · {formatDateTime(comment.createdAt, tz)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <RequestCommentForm requestId={request.id} canInternal={isReviewer} />
      </Card>
    </DetailLayout>
  );
}
