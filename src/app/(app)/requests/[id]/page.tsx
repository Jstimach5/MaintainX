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
import { Badge, Card, PageHeader } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import { AttachmentSection } from "@/components/attachments";
import { IMAGE_TYPES } from "@/server/storage";
import { DecisionBar, RequestCommentForm } from "../request-forms";
import { WoStatusBadge } from "../../work-orders/wo-badges";

export const metadata = { title: "Request" };

const TONES: Record<string, BadgeTone> = Object.fromEntries(
  REQUEST_STATUSES.map((s) => [s.value, s.tone]),
);

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
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
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={`${request.requestNumber} · ${request.title}`}
        subtitle={detail.siteName}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={TONES[request.status] ?? "gray"}>
          {requestStatusLabel(request.status)}
        </Badge>
        {request.priority !== "none" ? (
          <Badge tone={request.priority === "critical" ? "red" : request.priority === "high" ? "amber" : "gray"}>
            {request.priority}
          </Badge>
        ) : null}
        {request.source !== "internal" ? (
          <Badge tone="blue">{request.source}</Badge>
        ) : null}
      </div>

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
                className="font-medium text-blue-800 hover:underline"
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

      {isReviewer && request.status !== "converted" ? (
        <Card>
          <DecisionBar requestId={request.id} status={request.status} />
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-1 font-semibold">Details</h2>
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
                  className="text-blue-700 hover:underline"
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
        <h2 className="mb-2 font-semibold">Comments</h2>
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
    </div>
  );
}
