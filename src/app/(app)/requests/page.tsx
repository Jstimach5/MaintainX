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
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  Select,
} from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import { ListLayout } from "@/components/layout";
import { FilterToolbar } from "@/components/filter-toolbar";

export const metadata = { title: "Requests" };

const TONES: Record<string, BadgeTone> = Object.fromEntries(
  REQUEST_STATUSES.map((s) => [s.value, s.tone]),
);

/** Status rail colour; always paired with the text badge, never alone. */
const RAIL: Record<string, string> = {
  submitted: "bg-blue-400",
  under_review: "bg-amber-400",
  approved: "bg-green-500",
  declined: "bg-red-400",
  converted: "bg-purple-400",
  canceled: "bg-gray-300",
};

function priorityBadge(priority: string) {
  if (priority === "none") return null;
  const tone: BadgeTone =
    priority === "critical" ? "red" : priority === "high" ? "amber" : "gray";
  return <Badge tone={tone}>{priority}</Badge>;
}

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
    <ListLayout>
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
        <FilterToolbar activeCount={[params.status].filter(Boolean).length}>
          <Select
            name="status"
            defaultValue={params.status ?? ""}
            inline
            aria-label="Status"
          >
            <option value="">All statuses</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </FilterToolbar>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No requests"
          hint="Submit a request when something needs attention."
          action={<ButtonLink href="/requests/new">New request</ButtonLink>}
        />
      ) : (
        <>
          {/* Phones: record cards with a status rail. */}
          <Card className="divide-y divide-gray-100 p-0 md:hidden">
            {rows.map(({ request, siteName, assetName, requesterDisplay }) => (
              <Link
                key={request.id}
                href={`/requests/${request.id}`}
                className="relative block py-3 pr-4 pl-5 active:bg-gray-50"
              >
                <span
                  aria-hidden
                  className={`absolute inset-y-3 left-2 w-1 rounded-full ${
                    RAIL[request.status] ?? "bg-gray-300"
                  }`}
                />
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 font-medium text-brand-800">
                    {request.requestNumber} · {request.title}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {priorityBadge(request.priority)}
                    <Badge tone={TONES[request.status] ?? "gray"}>
                      {requestStatusLabel(request.status)}
                    </Badge>
                  </span>
                </span>
                <span className="mt-0.5 block text-sm text-gray-500">
                  {siteName}
                  {assetName ? ` · ${assetName}` : ""}
                  {" · "}
                  {requesterDisplay ?? request.requesterName ?? "anonymous"}
                  {" · "}
                  {formatDateTime(request.createdAt, org.timezone)}
                </span>
              </Link>
            ))}
          </Card>

          {/* Desktop: the columns a reviewer triages on. */}
          <Card className="hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs tracking-wide text-gray-500 uppercase">
                  <th className="px-4 py-2.5 font-semibold">Request</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Priority</th>
                  <th className="px-3 py-2.5 font-semibold">Site / asset</th>
                  <th className="px-3 py-2.5 font-semibold">Requested by</th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    Submitted
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(
                  ({ request, siteName, assetName, requesterDisplay }) => (
                    <tr key={request.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/requests/${request.id}`}
                          className="font-medium text-brand-800 hover:underline"
                        >
                          {request.requestNumber} · {request.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={TONES[request.status] ?? "gray"}>
                          {requestStatusLabel(request.status)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        {priorityBadge(request.priority) ?? (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="max-w-56 truncate px-3 py-2.5 text-gray-600">
                        {siteName}
                        {assetName ? ` · ${assetName}` : ""}
                      </td>
                      <td className="max-w-40 truncate px-3 py-2.5 text-gray-600">
                        {requesterDisplay ??
                          request.requesterName ??
                          "anonymous"}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap text-gray-600">
                        {formatDateTime(request.createdAt, org.timezone)}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </ListLayout>
  );
}
