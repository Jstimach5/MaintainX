"use client";

import { useActionState, useState } from "react";
import {
  changeAssetStatusAction,
  createAssetAction,
  transferAssetAction,
  updateAssetAction,
} from "./actions";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";

export type SiteOption = { id: number; name: string };
export type LocOption = { id: number; label: string; depth: number };
export type PickerData = {
  sites: SiteOption[];
  locationsBySite: Record<number, LocOption[]>;
};

export type AssetFormValues = {
  id: number;
  assetNumber: string;
  name: string;
  description: string | null;
  assetType: string | null;
  siteId: number;
  locationId: number | null;
  parentAssetId: number | null;
  make: string | null;
  model: string | null;
  serialNumber: string | null;
  year: number | null;
  purchaseDate: string | null;
  inServiceDate: string | null;
  warrantyInfo: string | null;
  criticality: string;
  responsibleTeamId: number | null;
  responsibleUserId: number | null;
  notes: string | null;
  tags: string[] | null;
};

const CRITICALITY = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

function LocationSelect({
  picker,
  siteId,
  defaultValue,
  idSuffix = "",
}: {
  picker: PickerData;
  siteId: number | null;
  defaultValue?: number | null;
  idSuffix?: string;
}) {
  const options = siteId != null ? (picker.locationsBySite[siteId] ?? []) : [];
  return (
    <Select
      id={`locationId${idSuffix}`}
      name="locationId"
      defaultValue={defaultValue == null ? "" : String(defaultValue)}
    >
      <option value="">— No specific location —</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {" ".repeat(o.depth * 3)}
          {o.label}
        </option>
      ))}
    </Select>
  );
}

export function AssetForm({
  picker,
  asset,
  parentOptions,
  teams,
  people,
}: {
  picker: PickerData;
  asset?: AssetFormValues;
  parentOptions: { id: number; label: string }[];
  teams: { id: number; name: string }[];
  people: { id: number; displayName: string }[];
}) {
  const [state, formAction] = useActionState(
    asset ? updateAssetAction : createAssetAction,
    undefined,
  );
  const [siteId, setSiteId] = useState<number | null>(asset?.siteId ?? null);

  return (
    <form action={formAction} className="space-y-4">
      {asset ? <input type="hidden" name="assetId" value={asset.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" required>
          <Input id="name" name="name" defaultValue={asset?.name} required />
        </Field>
        <Field
          label="Asset number"
          htmlFor="assetNumber"
          hint={asset ? undefined : "Leave blank to auto-assign (A-0001…)"}
        >
          <Input
            id="assetNumber"
            name="assetNumber"
            defaultValue={asset?.assetNumber}
          />
        </Field>
      </div>
      <Field label="Description" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          defaultValue={asset?.description ?? ""}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Asset type" htmlFor="assetType" hint="e.g. Compressor, Vehicle, HVAC">
          <Input
            id="assetType"
            name="assetType"
            defaultValue={asset?.assetType ?? ""}
          />
        </Field>
        <Field label="Criticality" htmlFor="criticality" required>
          <Select
            id="criticality"
            name="criticality"
            defaultValue={asset?.criticality ?? "medium"}
          >
            {CRITICALITY.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {asset ? (
        // Site/location moves go through the Transfer flow so history is kept.
        <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
          To move this asset to another site or location, use{" "}
          <strong>Transfer</strong> on the asset page — transfers keep the
          location history.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Site" htmlFor="siteId" required>
            <Select
              id="siteId"
              name="siteId"
              value={siteId == null ? "" : String(siteId)}
              onChange={(e) =>
                setSiteId(e.target.value ? Number(e.target.value) : null)
              }
              required
            >
              <option value="">— Choose a site —</option>
              {picker.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Location" htmlFor="locationId">
            <LocationSelect picker={picker} siteId={siteId} />
          </Field>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Parent asset" htmlFor="parentAssetId" hint="For sub-assets (e.g. a motor on a machine)">
          <Select
            id="parentAssetId"
            name="parentAssetId"
            defaultValue={
              asset?.parentAssetId == null ? "" : String(asset.parentAssetId)
            }
          >
            <option value="">— None —</option>
            {parentOptions
              .filter((o) => o.id !== asset?.id)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Serial number" htmlFor="serialNumber">
          <Input
            id="serialNumber"
            name="serialNumber"
            defaultValue={asset?.serialNumber ?? ""}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Make" htmlFor="make">
          <Input id="make" name="make" defaultValue={asset?.make ?? ""} />
        </Field>
        <Field label="Model" htmlFor="model">
          <Input id="model" name="model" defaultValue={asset?.model ?? ""} />
        </Field>
        <Field label="Year" htmlFor="year">
          <Input
            id="year"
            name="year"
            type="number"
            min={1900}
            max={2100}
            defaultValue={asset?.year ?? ""}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Purchase date" htmlFor="purchaseDate">
          <Input
            id="purchaseDate"
            name="purchaseDate"
            type="date"
            defaultValue={asset?.purchaseDate ?? ""}
          />
        </Field>
        <Field label="In-service date" htmlFor="inServiceDate">
          <Input
            id="inServiceDate"
            name="inServiceDate"
            type="date"
            defaultValue={asset?.inServiceDate ?? ""}
          />
        </Field>
      </div>
      <Field label="Warranty information" htmlFor="warrantyInfo">
        <Textarea
          id="warrantyInfo"
          name="warrantyInfo"
          defaultValue={asset?.warrantyInfo ?? ""}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Responsible team" htmlFor="responsibleTeamId">
          <Select
            id="responsibleTeamId"
            name="responsibleTeamId"
            defaultValue={
              asset?.responsibleTeamId == null
                ? ""
                : String(asset.responsibleTeamId)
            }
          >
            <option value="">— None —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Responsible person" htmlFor="responsibleUserId">
          <Select
            id="responsibleUserId"
            name="responsibleUserId"
            defaultValue={
              asset?.responsibleUserId == null
                ? ""
                : String(asset.responsibleUserId)
            }
          >
            <option value="">— None —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Tags" htmlFor="tags" hint="Comma-separated, e.g. forklift, leased">
        <Input
          id="tags"
          name="tags"
          defaultValue={asset?.tags?.join(", ") ?? ""}
        />
      </Field>
      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={asset?.notes ?? ""} />
      </Field>
      <FormError message={state?.error} />
      <SubmitButton>{asset ? "Save asset" : "Create asset"}</SubmitButton>
    </form>
  );
}

export function StatusChangeForm({
  assetId,
  current,
  statuses,
}: {
  assetId: number;
  current: string;
  statuses: { value: string; label: string }[];
}) {
  const [state, formAction] = useActionState(changeAssetStatusAction, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="assetId" value={assetId} />
      <Field label="New status" htmlFor="status">
        <Select id="status" name="status" defaultValue={current}>
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note" htmlFor="status-note">
        <Input id="status-note" name="note" placeholder="Why? (optional)" />
      </Field>
      <FormError message={state?.error} />
      <SubmitButton variant="secondary">Update status</SubmitButton>
    </form>
  );
}

export function TransferForm({
  assetId,
  picker,
  currentSiteId,
  currentLocationId,
}: {
  assetId: number;
  picker: PickerData;
  currentSiteId: number;
  currentLocationId: number | null;
}) {
  const [state, formAction] = useActionState(transferAssetAction, undefined);
  const [siteId, setSiteId] = useState<number>(currentSiteId);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="assetId" value={assetId} />
      <Field label="Site" htmlFor="transfer-siteId">
        <Select
          id="transfer-siteId"
          name="siteId"
          value={String(siteId)}
          onChange={(e) => setSiteId(Number(e.target.value))}
        >
          {picker.sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Location" htmlFor="locationId-transfer">
        <LocationSelect
          picker={picker}
          siteId={siteId}
          defaultValue={siteId === currentSiteId ? currentLocationId : null}
          idSuffix="-transfer"
        />
      </Field>
      <Field label="Note" htmlFor="transfer-note">
        <Input id="transfer-note" name="note" placeholder="Reason (optional)" />
      </Field>
      <FormError message={state?.error} />
      <SubmitButton variant="secondary">Transfer asset</SubmitButton>
    </form>
  );
}
