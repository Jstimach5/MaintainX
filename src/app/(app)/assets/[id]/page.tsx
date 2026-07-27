import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import {
  ASSET_STATUSES,
  assetStatusLabel,
  getAssetDetail,
} from "@/server/services/assets";
import { listAttachments } from "@/server/services/attachments";
import { getOrgSettings } from "@/server/services/org";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  Badge,
  ButtonLink,
  Card,
  PageHeader,
} from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import { AttachmentSection } from "@/components/attachments";
import { StatusChangeForm, TransferForm } from "../asset-forms";
import { buildPickerData } from "../picker";
import { setAssetArchivedAction } from "../actions";
import { IMAGE_TYPES } from "@/server/storage";

export const metadata = { title: "Asset" };

const STATUS_TONES: Record<string, BadgeTone> = Object.fromEntries(
  ASSET_STATUSES.map((s) => [s.value, s.tone]),
);

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("admin", "manager", "technician");
  const { id } = await params;
  const assetId = Number(id);
  if (!Number.isInteger(assetId)) notFound();
  const detail = await getAssetDetail(assetId);
  if (!detail) notFound();
  const { asset, site, location, parent, children } = detail;
  const org = await getOrgSettings();
  const tz = org.timezone;
  const attachments = await listAttachments("asset", assetId);
  const picker = await buildPickerData();
  const isAdmin = user.role === "admin";
  const canManage = user.role === "admin" || user.role === "manager";

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${asset.assetNumber} · ${asset.name}`}
        subtitle={[
          site?.name,
          location?.name,
          asset.assetType ?? undefined,
        ]
          .filter(Boolean)
          .join(" › ")}
        actions={
          <>
            <ButtonLink href={`/assets/${asset.id}/label`} variant="secondary">
              QR label
            </ButtonLink>
            {isAdmin ? (
              <>
                <ButtonLink href={`/assets/${asset.id}/edit`} variant="secondary">
                  Edit
                </ButtonLink>
                <form action={setAssetArchivedAction}>
                  <input type="hidden" name="assetId" value={asset.id} />
                  <input
                    type="hidden"
                    name="archived"
                    value={asset.archivedAt ? "false" : "true"}
                  />
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                  >
                    {asset.archivedAt ? "Restore" : "Archive"}
                  </button>
                </form>
              </>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONES[asset.status] ?? "gray"}>
          {assetStatusLabel(asset.status)}
        </Badge>
        <Badge
          tone={
            asset.criticality === "critical"
              ? "red"
              : asset.criticality === "high"
                ? "amber"
                : "gray"
          }
        >
          {asset.criticality} criticality
        </Badge>
        {asset.archivedAt ? <Badge tone="red">archived</Badge> : null}
        {asset.tags?.map((t) => (
          <Badge key={t} tone="blue">
            {t}
          </Badge>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <h2 className="mb-1 font-semibold">Details</h2>
            {asset.description ? (
              <p className="mb-2 text-sm whitespace-pre-wrap">{asset.description}</p>
            ) : null}
            <dl className="divide-y divide-gray-100">
              <InfoRow label="Make" value={asset.make} />
              <InfoRow label="Model" value={asset.model} />
              <InfoRow label="Serial number" value={asset.serialNumber} />
              <InfoRow label="Year" value={asset.year} />
              <InfoRow
                label="Purchase date"
                value={asset.purchaseDate ? formatDate(asset.purchaseDate, tz) : null}
              />
              <InfoRow
                label="In service since"
                value={asset.inServiceDate ? formatDate(asset.inServiceDate, tz) : null}
              />
              <InfoRow label="Warranty" value={asset.warrantyInfo} />
              <InfoRow
                label="Responsible team"
                value={detail.responsibleTeam?.name}
              />
              <InfoRow
                label="Responsible person"
                value={detail.responsibleUser?.displayName}
              />
              <InfoRow
                label="Parent asset"
                value={
                  parent ? (
                    <Link
                      href={`/assets/${parent.id}`}
                      className="text-blue-700 hover:underline"
                    >
                      {parent.assetNumber} · {parent.name}
                    </Link>
                  ) : null
                }
              />
              <InfoRow label="Notes" value={asset.notes} />
            </dl>
          </Card>

          <Card>
            <AttachmentSection
              entityType="asset"
              entityId={asset.id}
              canUpload={!asset.archivedAt}
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

          {children.length > 0 ? (
            <Card>
              <h2 className="mb-2 font-semibold">Sub-assets</h2>
              <ul className="space-y-1">
                {children.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <Link
                      href={`/assets/${c.id}`}
                      className="text-blue-700 hover:underline"
                    >
                      {c.assetNumber} · {c.name}
                    </Link>
                    <Badge tone={STATUS_TONES[c.status] ?? "gray"}>
                      {assetStatusLabel(c.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <h2 className="mb-2 font-semibold">Open work orders</h2>
            <p className="text-sm text-gray-500">
              Work orders arrive in the next phase — this asset&apos;s open and
              completed work will show here.
            </p>
          </Card>
        </div>

        <div className="space-y-4">
          {!asset.archivedAt ? (
            <Card>
              <h2 className="mb-2 font-semibold">Change status</h2>
              <StatusChangeForm
                assetId={asset.id}
                current={asset.status}
                statuses={ASSET_STATUSES.map((s) => ({
                  value: s.value,
                  label: s.label,
                }))}
              />
            </Card>
          ) : null}

          {canManage && !asset.archivedAt ? (
            <Card>
              <h2 className="mb-2 font-semibold">Transfer</h2>
              <TransferForm
                assetId={asset.id}
                picker={picker}
                currentSiteId={asset.siteId}
                currentLocationId={asset.locationId}
              />
            </Card>
          ) : null}

          <Card>
            <h2 className="mb-2 font-semibold">Status history</h2>
            {detail.statusHistory.length === 0 ? (
              <p className="text-sm text-gray-500">No status changes yet.</p>
            ) : (
              <ul className="space-y-2">
                {detail.statusHistory.map(({ entry, changedByName }) => (
                  <li key={entry.id} className="text-sm">
                    <span className="font-medium">
                      {entry.previousStatus
                        ? `${assetStatusLabel(entry.previousStatus)} → `
                        : ""}
                      {assetStatusLabel(entry.status)}
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
            )}
          </Card>

          <Card>
            <h2 className="mb-2 font-semibold">Location history</h2>
            {detail.locationHistory.length === 0 ? (
              <p className="text-sm text-gray-500">No moves recorded.</p>
            ) : (
              <ul className="space-y-2">
                {detail.locationHistory.map(
                  ({ entry, movedByName, siteName, locationName }) => (
                    <li key={entry.id} className="text-sm">
                      <span className="font-medium">
                        {siteName}
                        {locationName ? ` › ${locationName}` : ""}
                      </span>
                      {entry.note ? (
                        <span className="text-gray-600"> — {entry.note}</span>
                      ) : null}
                      <br />
                      <span className="text-gray-400">
                        {movedByName} · {formatDateTime(entry.createdAt, tz)}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
