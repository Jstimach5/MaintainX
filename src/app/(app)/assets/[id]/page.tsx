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
import { Badge, ButtonLink, Card, buttonClasses } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import { DetailLayout } from "@/components/layout";
import { ArrowLeft, ChevronDown } from "@/components/icons";
import { AttachmentSection } from "@/components/attachments";
import { ConfirmSubmit } from "@/components/dialog";
import { StatusChangeForm, TransferForm } from "../asset-forms";
import { buildPickerData } from "@/server/services/pickers";
import { setAssetArchivedAction } from "../actions";
import { IMAGE_TYPES } from "@/server/storage";
import { listWorkOrders } from "@/server/services/workOrders";
import { WoStatusBadge } from "@/components/wo-badges";

export const metadata = { title: "Asset" };

const STATUS_TONES: Record<string, BadgeTone> = Object.fromEntries(
  ASSET_STATUSES.map((s) => [s.value, s.tone]),
);

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "" || value === "—") return null;
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
  const assetWos = await listWorkOrders({ assetId, includeDone: true });
  const isAdmin = user.role === "admin";
  const canManage = user.role === "admin" || user.role === "manager";

  return (
    <DetailLayout
      header={
        <div className="mb-4 space-y-3">
          <div>
            <Link
              href="/assets"
              className="mb-1 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-brand-800"
            >
              <ArrowLeft aria-hidden className="h-4 w-4" />
              Assets
            </Link>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-bold sm:text-2xl">
                  {asset.assetNumber} · {asset.name}
                </h1>
                <p className="text-sm text-gray-500">
                  {site ? (
                    <Link
                      href={`/sites/${site.id}`}
                      className="hover:text-brand-800 hover:underline"
                    >
                      {site.name}
                    </Link>
                  ) : null}
                  {location ? ` › ${location.name}` : null}
                  {asset.assetType ? ` › ${asset.assetType}` : null}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canManage && !asset.archivedAt ? (
                  <ButtonLink href={`/work-orders/new?asset=${asset.id}`}>
                    New work order
                  </ButtonLink>
                ) : null}
                <ButtonLink
                  href={`/assets/${asset.id}/label`}
                  variant="secondary"
                >
                  QR label
                </ButtonLink>
                {isAdmin ? (
                  <>
                    <ButtonLink
                      href={`/assets/${asset.id}/edit`}
                      variant="secondary"
                    >
                      Edit
                    </ButtonLink>
                    <form action={setAssetArchivedAction}>
                      <input type="hidden" name="assetId" value={asset.id} />
                      <input
                        type="hidden"
                        name="archived"
                        value={asset.archivedAt ? "false" : "true"}
                      />
                      {asset.archivedAt ? (
                        <button
                          type="submit"
                          className={buttonClasses("secondary")}
                        >
                          Restore
                        </button>
                      ) : (
                        <ConfirmSubmit
                          label="Archive"
                          title={`Archive ${asset.name}?`}
                          body="The asset stops appearing in pickers and new work cannot reference it. History and past work orders are kept, and you can restore it later."
                          variant="secondary"
                        />
                      )}
                    </form>
                  </>
                ) : null}
              </div>
            </div>
          </div>

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
        </div>
      }
      rail={
        <>
          {!asset.archivedAt ? (
            <Card>
              <SectionTitle>Change status</SectionTitle>
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
              {/* Rarely used — collapsed by default to keep the rail calm. */}
              <details className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold tracking-wide text-gray-900 uppercase [&::-webkit-details-marker]:hidden">
                  Transfer to another location
                  <ChevronDown
                    aria-hidden
                    className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="mt-2">
                  <TransferForm
                    assetId={asset.id}
                    picker={picker}
                    currentSiteId={asset.siteId}
                    currentLocationId={asset.locationId}
                  />
                </div>
              </details>
            </Card>
          ) : null}

          <Card>
            <SectionTitle>Status history</SectionTitle>
            {detail.statusHistory.length === 0 ? (
              <p className="text-sm text-gray-500">No status changes yet.</p>
            ) : (
              <ol className="relative ml-1.5 space-y-3 border-l border-gray-200 pl-4">
                {detail.statusHistory.map(({ entry, changedByName }) => (
                  <li key={entry.id} className="relative text-sm">
                    <span
                      aria-hidden
                      className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-400"
                    />
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
              </ol>
            )}
          </Card>

          <Card>
            <SectionTitle>Location history</SectionTitle>
            {detail.locationHistory.length === 0 ? (
              <p className="text-sm text-gray-500">No moves recorded.</p>
            ) : (
              <ol className="relative ml-1.5 space-y-3 border-l border-gray-200 pl-4">
                {detail.locationHistory.map(
                  ({ entry, movedByName, siteName, locationName }) => (
                    <li key={entry.id} className="relative text-sm">
                      <span
                        aria-hidden
                        className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-white bg-gray-300"
                      />
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
              </ol>
            )}
          </Card>
        </>
      }
    >
      <Card>
        <SectionTitle>Details</SectionTitle>
        {asset.description ? (
          <p className="mb-2 text-sm whitespace-pre-wrap">
            {asset.description}
          </p>
        ) : null}
        <dl className="divide-y divide-gray-100">
          <InfoRow label="Make" value={asset.make} />
          <InfoRow label="Model" value={asset.model} />
          <InfoRow label="Serial number" value={asset.serialNumber} />
          <InfoRow label="Year" value={asset.year} />
          <InfoRow
            label="Purchase date"
            value={
              asset.purchaseDate ? formatDate(asset.purchaseDate, tz) : null
            }
          />
          <InfoRow
            label="In service since"
            value={
              asset.inServiceDate ? formatDate(asset.inServiceDate, tz) : null
            }
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
                  className="text-brand-800 hover:underline"
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
          <SectionTitle>Sub-assets</SectionTitle>
          <ul className="space-y-1">
            {children.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between text-sm"
              >
                <Link
                  href={`/assets/${c.id}`}
                  className="text-brand-800 hover:underline"
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
        <SectionTitle>Work history</SectionTitle>
        {assetWos.length === 0 ? (
          <p className="text-sm text-gray-500">
            No work orders reference this asset yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {assetWos.map(({ wo }) => (
              <li
                key={wo.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <Link
                  href={`/work-orders/${wo.id}`}
                  className="text-brand-800 hover:underline"
                >
                  {wo.woNumber} · {wo.title}
                </Link>
                <WoStatusBadge status={wo.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </DetailLayout>
  );
}
