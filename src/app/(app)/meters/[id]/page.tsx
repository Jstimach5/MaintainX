import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import {
  getMeter,
  listReadings,
  listTriggers,
  meterWoHistory,
} from "@/server/services/meters";
import { listAssets } from "@/server/services/assets";
import { listSites } from "@/server/services/sites";
import { listLocationOptions } from "@/server/services/locations";
import { listTemplates } from "@/server/services/procedures";
import { listTeams } from "@/server/services/teams";
import { listUsers } from "@/server/services/users";
import { getOrgSettings } from "@/server/services/org";
import { formatDateTime } from "@/lib/format";
import { Badge, Card } from "@/components/ui";
import { LineChart } from "@/components/charts";
import { DetailLayout } from "@/components/layout";
import { ArrowLeft } from "@/components/icons";
import {
  CorrectionForm,
  MeterForm,
  ReadingForm,
  TriggerForm,
} from "../meter-forms";
import { toggleTriggerAction } from "../actions";
import { WoStatusBadge } from "@/components/wo-badges";

export const metadata = { title: "Meter" };

export default async function MeterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("admin", "manager", "technician");
  const { id } = await params;
  const meterId = Number(id);
  if (!Number.isInteger(meterId)) notFound();
  const meter = await getMeter(meterId);
  if (!meter) notFound();

  const canManage = user.role !== "technician";
  const [readings, triggers, woHistory, org, allUsers] = await Promise.all([
    listReadings(meterId),
    listTriggers(meterId),
    meterWoHistory(meterId),
    getOrgSettings(),
    listUsers(),
  ]);
  const tz = org.timezone;
  const nameOf = (uid: number | null) =>
    uid == null
      ? "portal"
      : (allUsers.find((u) => u.id === uid)?.displayName ?? `user ${uid}`);

  let manageData: {
    assets: { id: number; label: string }[];
    locations: { id: number; label: string }[];
    procedures: { id: number; name: string }[];
    teams: { id: number; name: string }[];
  } | null = null;
  if (canManage) {
    const [assetRows, sites, templates, teams] = await Promise.all([
      listAssets({}),
      listSites({ activeOnly: true }),
      listTemplates(),
      listTeams(),
    ]);
    const locations: { id: number; label: string }[] = [];
    for (const site of sites) {
      for (const o of await listLocationOptions(site.id)) {
        locations.push({ id: o.id, label: `${site.name} › ${o.label}` });
      }
    }
    manageData = {
      assets: assetRows.map((r) => ({
        id: r.asset.id,
        label: `${r.asset.assetNumber} · ${r.asset.name}`,
      })),
      locations,
      procedures: templates
        .filter((t) => t.isActive)
        .map((t) => ({ id: t.id, name: t.name })),
      teams: teams.filter((t) => t.isActive).map((t) => ({ id: t.id, name: t.name })),
    };
  }

  return (
    <DetailLayout
      header={
        <div className="mb-4">
          <Link
            href="/meters"
            className="mb-1 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-brand-800"
          >
            <ArrowLeft aria-hidden className="h-4 w-4" />
            Meters
          </Link>
          <h1 className="text-xl font-bold sm:text-2xl">{meter.name}</h1>
          <p className="text-sm text-gray-500">
            Current:{" "}
            {meter.currentValue != null
              ? `${Number(meter.currentValue)} ${meter.unit}`
              : "no readings yet"}
          </p>
        </div>
      }
      rail={
        <>
      <Card>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-gray-900 uppercase">Triggers</h2>
        {triggers.length === 0 ? (
          <p className="mb-2 text-sm text-gray-500">
            No triggers — readings are recorded but never generate work.
          </p>
        ) : (
          <ul className="mb-3 space-y-2">
            {triggers.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium">{t.name}</span>{" "}
                  <span className="text-gray-500">
                    {t.type === "threshold"
                      ? `at ${Number(t.threshold)} ${meter.unit}`
                      : `every ${Number(t.intervalValue)} ${meter.unit} (next ≥ ${Number(t.lastFiredValue ?? 0) + Number(t.intervalValue)})`}
                    {" → "}&ldquo;{t.woTitle}&rdquo;
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {!t.isActive ? <Badge tone="gray">disabled</Badge> : null}
                  {canManage ? (
                    <form action={toggleTriggerAction}>
                      <input type="hidden" name="meterId" value={meter.id} />
                      <input type="hidden" name="triggerId" value={t.id} />
                      <input type="hidden" name="active" value={t.isActive ? "false" : "true"} />
                      <button type="submit" className="text-xs text-brand-800 hover:underline">
                        {t.isActive ? "Disable" : "Enable"}
                      </button>
                    </form>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        {canManage && manageData ? (
          <TriggerForm
            meterId={meter.id}
            unit={meter.unit}
            procedures={manageData.procedures}
            teams={manageData.teams}
          />
        ) : null}
      </Card>
      {woHistory.length > 0 ? (
        <Card>
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-gray-900 uppercase">Work orders from this meter</h2>
          <ul className="space-y-1">
            {woHistory.map(({ event, wo }) => (
              <li key={event.id} className="flex items-center justify-between gap-2 text-sm">
                {wo ? (
                  <Link href={`/work-orders/${wo.id}`} className="text-brand-800 hover:underline">
                    {wo.woNumber} · {wo.title}
                  </Link>
                ) : (
                  <span className="text-gray-500">pending</span>
                )}
                <span className="flex items-center gap-2">
                  {wo ? <WoStatusBadge status={wo.status} /> : null}
                  <span className="text-xs text-gray-400">
                    {formatDateTime(event.createdAt, tz)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {canManage && manageData ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-gray-900 uppercase">Edit meter</h2>
          <MeterForm
            assets={manageData.assets}
            locations={manageData.locations}
            meter={{
              id: meter.id,
              name: meter.name,
              description: meter.description,
              unit: meter.unit,
              assetId: meter.assetId,
              locationId: meter.locationId,
              mustIncrease: meter.mustIncrease,
              warnThreshold: meter.warnThreshold,
              criticalThreshold: meter.criticalThreshold,
              isActive: meter.isActive,
            }}
          />
        </Card>
      ) : null}
        </>
      }
    >
      <Card>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-gray-900 uppercase">Enter a reading</h2>
        <ReadingForm meterId={meter.id} unit={meter.unit} />
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-gray-900 uppercase">Trend</h2>
        <LineChart
          unit={meter.unit}
          thresholds={[
            ...(meter.warnThreshold != null
              ? [
                  {
                    value: Number(meter.warnThreshold),
                    label: "warn",
                    tone: "warn" as const,
                  },
                ]
              : []),
            ...(meter.criticalThreshold != null
              ? [
                  {
                    value: Number(meter.criticalThreshold),
                    label: "critical",
                    tone: "critical" as const,
                  },
                ]
              : []),
          ]}
          points={[...readings]
            .filter((r) => !r.isVoided)
            .reverse()
            .map((r, i) => ({
              x: i,
              label: formatDateTime(r.readingAt, tz),
              value: Number(r.value),
            }))}
        />
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-gray-900 uppercase">Reading history</h2>
        {readings.length === 0 ? (
          <p className="text-sm text-gray-500">No readings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase">
                  <th className="py-1 pr-3">Value</th>
                  <th className="py-1 pr-3">When</th>
                  <th className="py-1 pr-3">By</th>
                  <th className="py-1 pr-3">Note</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {readings.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-gray-100 ${r.isVoided ? "text-gray-400 line-through" : ""}`}
                  >
                    <td className="py-1.5 pr-3 font-medium">
                      {Number(r.value)} {meter.unit}
                      {r.isRollover ? " ↺" : ""}
                      {r.correctsReadingId ? (
                        <span className="ml-1 text-xs text-amber-700 no-underline">
                          (correction)
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3">{formatDateTime(r.readingAt, tz)}</td>
                    <td className="py-1.5 pr-3">{nameOf(r.recordedBy)}</td>
                    <td className="py-1.5 pr-3">{r.note ?? ""}</td>
                    <td className="py-1.5">
                      {canManage && !r.isVoided && !r.correctsReadingId ? (
                        <CorrectionForm
                          meterId={meter.id}
                          readingId={r.id}
                          currentValue={r.value}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </DetailLayout>
  );
}
