import Link from "next/link";
import { requireUser } from "@/server/auth/guards";
import {
  REQUEST_STATUSES,
  listRequests,
  requestStatusLabel,
  type RequestStatusValue,
} from "@/server/services/requests";
import { getOrgSettings } from "@/server/services/org";
import { formatDateTime } from "@/lib/format";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";

export const metadata = { title: "Requests" };

const TONES: Record<string, BadgeTone> = Object.fromEntries(
  REQUEST_STATUSES.map((s) => [s.value, s.tone]),
);

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const org = await getOrgSettings();
  const status = REQUEST_STATUSES.some((s) => s.value === params.status)
    ? (params.status as RequestStatusValue)
    : undefined;

  const isReviewer = user.role === "admin" || user.role === "manager";
  const rows = await listRequests({
    status,
    // Requesters and technicians see their own submissions only.
    requesterId: isReviewer ? undefined : user.id,
  });

  return (
    <div>
      <PageHeader
        title="Work requests"
        subtitle={
          isReviewer
            ? "Review, approve, and convert incoming requests."
            : "Your submitted requests and their status."
        }
        actions={<ButtonLink href="/requests/new">New request</ButtonLink>}
      />
      {isReviewer ? (
        <form method="get" className="mb-4 flex flex-wrap gap-2">
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-base"
          >
            <option value="">All statuses</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="min-h-11 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Filter
          </button>
        </form>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title="No requests"
          hint="Submit a request when something needs attention."
          action={<ButtonLink href="/requests/new">New request</ButtonLink>}
        />
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {rows.map(({ request, siteName, assetName, requesterDisplay }) => (
            <div key={request.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/requests/${request.id}`}
                  className="font-medium text-blue-800 hover:underline"
                >
                  {request.requestNumber} · {request.title}
                </Link>
                <Badge tone={TONES[request.status] ?? "gray"}>
                  {requestStatusLabel(request.status)}
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-gray-500">
                {siteName}
                {assetName ? ` · ${assetName}` : ""}
                {" · "}
                {requesterDisplay ?? request.requesterName ?? "anonymous"}
                {" · "}
                {formatDateTime(request.createdAt, org.timezone)}
              </p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
