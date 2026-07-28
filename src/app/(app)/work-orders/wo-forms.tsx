"use client";

import { useActionState, useState } from "react";
import {
  addLaborAction,
  addPartAction,
  addWoCommentAction,
  addWoMeterReadingAction,
  changeWoStatusAction,
  createWorkOrderAction,
  removePartAction,
  updateWorkOrderAction,
} from "./actions";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";
import type { PickerData } from "../assets/asset-forms";

export type WoFormValues = {
  id: number;
  title: string;
  description: string | null;
  siteId: number;
  locationId: number | null;
  parentWorkOrderId: number | null;
  workType: string;
  priority: string;
  assignedTeamId: number | null;
  requesterId: number | null;
  plannedStartAt: string | null; // datetime-local format
  dueAt: string | null;
  estimatedMinutes: number | null;
  plannedDowntimeMinutes: number | null;
  tags: string[] | null;
  assetIds: number[];
  assigneeIds: number[];
};

export type WoFormData = {
  picker: PickerData;
  assetsBySite: Record<number, { id: number; label: string }[]>;
  teams: { id: number; name: string }[];
  people: { id: number; displayName: string }[];
  types: { value: string; label: string }[];
  priorities: { value: string; label: string }[];
  parentOptions: { id: number; label: string }[];
};

export function WorkOrderForm({
  data,
  wo,
  defaults,
}: {
  data: WoFormData;
  wo?: WoFormValues;
  defaults?: { siteId?: number; assetIds?: number[] };
}) {
  const [state, formAction] = useActionState(
    wo ? updateWorkOrderAction : createWorkOrderAction,
    undefined,
  );
  const [siteId, setSiteId] = useState<number | null>(
    wo?.siteId ?? defaults?.siteId ?? null,
  );
  const checkedAssetIds = wo?.assetIds ?? defaults?.assetIds ?? [];
  const siteAssets = siteId != null ? (data.assetsBySite[siteId] ?? []) : [];
  const siteLocations =
    siteId != null ? (data.picker.locationsBySite[siteId] ?? []) : [];

  return (
    <form action={formAction} className="space-y-4">
      {wo ? <input type="hidden" name="workOrderId" value={wo.id} /> : null}
      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" defaultValue={wo?.title} required />
      </Field>
      <Field label="Description" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          defaultValue={wo?.description ?? ""}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Work type" htmlFor="workType" required>
          <Select
            id="workType"
            name="workType"
            defaultValue={wo?.workType ?? "reactive"}
          >
            {data.types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="priority" required>
          <Select
            id="priority"
            name="priority"
            defaultValue={wo?.priority ?? "medium"}
          >
            {data.priorities.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Parent work order" htmlFor="parentWorkOrderId">
          <Select
            id="parentWorkOrderId"
            name="parentWorkOrderId"
            defaultValue={
              wo?.parentWorkOrderId == null ? "" : String(wo.parentWorkOrderId)
            }
          >
            <option value="">— None —</option>
            {data.parentOptions
              .filter((o) => o.id !== wo?.id)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
          </Select>
        </Field>
      </div>
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
            {data.picker.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Location" htmlFor="locationId">
          <Select
            id="locationId"
            name="locationId"
            defaultValue={wo?.locationId == null ? "" : String(wo.locationId)}
          >
            <option value="">— No specific location —</option>
            {siteLocations.map((o) => (
              <option key={o.id} value={o.id}>
                {" ".repeat(o.depth * 3)}
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-gray-700">
          Assets {siteId == null ? "(choose a site first)" : ""}
        </legend>
        <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
          {siteAssets.length === 0 ? (
            <p className="text-sm text-gray-400">No assets at this site.</p>
          ) : (
            siteAssets.map((a) => (
              <label
                key={a.id}
                className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  name="assetIds"
                  value={a.id}
                  defaultChecked={checkedAssetIds.includes(a.id)}
                  className="h-4 w-4"
                />
                <span className="text-sm">{a.label}</span>
              </label>
            ))
          )}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Assign team" htmlFor="assignedTeamId">
          <Select
            id="assignedTeamId"
            name="assignedTeamId"
            defaultValue={
              wo?.assignedTeamId == null ? "" : String(wo.assignedTeamId)
            }
          >
            <option value="">— None —</option>
            {data.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Requested by" htmlFor="requesterId">
          <Select
            id="requesterId"
            name="requesterId"
            defaultValue={wo?.requesterId == null ? "" : String(wo.requesterId)}
          >
            <option value="">— None —</option>
            {data.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-gray-700">
          Assign people
        </legend>
        <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
          {data.people.map((p) => (
            <label
              key={p.id}
              className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                name="assigneeIds"
                value={p.id}
                defaultChecked={wo?.assigneeIds.includes(p.id)}
                className="h-4 w-4"
              />
              <span className="text-sm">{p.displayName}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Planned start" htmlFor="plannedStartAt">
          <Input
            id="plannedStartAt"
            name="plannedStartAt"
            type="datetime-local"
            defaultValue={wo?.plannedStartAt ?? ""}
          />
        </Field>
        <Field label="Due" htmlFor="dueAt">
          <Input
            id="dueAt"
            name="dueAt"
            type="datetime-local"
            defaultValue={wo?.dueAt ?? ""}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Estimated time (minutes)" htmlFor="estimatedMinutes">
          <Input
            id="estimatedMinutes"
            name="estimatedMinutes"
            type="number"
            min={0}
            defaultValue={wo?.estimatedMinutes ?? ""}
          />
        </Field>
        <Field label="Planned downtime (minutes)" htmlFor="plannedDowntimeMinutes">
          <Input
            id="plannedDowntimeMinutes"
            name="plannedDowntimeMinutes"
            type="number"
            min={0}
            defaultValue={wo?.plannedDowntimeMinutes ?? ""}
          />
        </Field>
      </div>
      <Field label="Tags" htmlFor="tags" hint="Comma-separated">
        <Input id="tags" name="tags" defaultValue={wo?.tags?.join(", ") ?? ""} />
      </Field>
      <FormError message={state?.error} />
      <SubmitButton>{wo ? "Save work order" : "Create work order"}</SubmitButton>
    </form>
  );
}

/** One-tap status buttons + complete-with-notes flow (§7, mobile-first). */
export function QuickStatusBar({
  workOrderId,
  status,
  canCancel,
}: {
  workOrderId: number;
  status: string;
  canCancel: boolean;
}) {
  const [state, formAction] = useActionState(changeWoStatusAction, undefined);
  const [completing, setCompleting] = useState(false);

  const btn = (target: string, label: string, variant: "primary" | "secondary" | "danger" = "secondary") => (
    <form action={formAction}>
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <input type="hidden" name="status" value={target} />
      <SubmitButton variant={variant}>{label}</SubmitButton>
    </form>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status !== "in_progress" && status !== "completed" && status !== "canceled"
          ? btn("in_progress", "Start work", "primary")
          : null}
        {status === "in_progress" ? btn("on_hold", "Put on hold") : null}
        {status === "in_progress" || status === "on_hold" || status === "waiting" ? (
          <Button type="button" onClick={() => setCompleting((v) => !v)}>
            Mark completed…
          </Button>
        ) : null}
        {status === "completed" ? btn("in_progress", "Reopen") : null}
        {canCancel && status !== "completed" && status !== "canceled"
          ? btn("canceled", "Cancel", "danger")
          : null}
        {status === "canceled" ? btn("open", "Reopen") : null}
      </div>
      {completing ? (
        <form action={formAction} className="space-y-3 rounded-md border border-gray-200 p-3">
          <input type="hidden" name="workOrderId" value={workOrderId} />
          <input type="hidden" name="status" value="completed" />
          <Field label="Completion notes" htmlFor="completionNotes">
            <Textarea
              id="completionNotes"
              name="completionNotes"
              placeholder="What was done?"
            />
          </Field>
          <Field label="Actual downtime (minutes)" htmlFor="actualDowntimeMinutes">
            <Input
              id="actualDowntimeMinutes"
              name="actualDowntimeMinutes"
              type="number"
              min={0}
            />
          </Field>
          <SubmitButton>Complete work order</SubmitButton>
        </form>
      ) : null}
      <FormError message={state?.error} />
    </div>
  );
}

export function CommentForm({ workOrderId }: { workOrderId: number }) {
  const [state, formAction] = useActionState(addWoCommentAction, undefined);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <Textarea name="body" placeholder="Add a comment…" required />
      <FormError message={state?.error} />
      <SubmitButton variant="secondary">Comment</SubmitButton>
    </form>
  );
}

export function LaborForm({ workOrderId }: { workOrderId: number }) {
  const [state, formAction] = useActionState(addLaborAction, undefined);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Hours" htmlFor="labor-hours">
          <Input
            id="labor-hours"
            name="hours"
            type="number"
            min={0}
            max={24}
            defaultValue={0}
            className="w-20"
          />
        </Field>
        <Field label="Minutes" htmlFor="labor-minutes">
          <Input
            id="labor-minutes"
            name="minutes"
            type="number"
            min={0}
            max={59}
            defaultValue={30}
            className="w-20"
          />
        </Field>
        <Field label="Date" htmlFor="labor-date">
          <Input id="labor-date" name="workDate" type="date" />
        </Field>
        <SubmitButton variant="secondary">Log time</SubmitButton>
      </div>
      <Input name="note" placeholder="What did you work on? (optional)" />
      <FormError message={state?.error} />
    </form>
  );
}

export function PartsForm({ workOrderId }: { workOrderId: number }) {
  const [state, formAction] = useActionState(addPartAction, undefined);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <Field label="Part or material" htmlFor="part-name">
        <Input
          id="part-name"
          name="name"
          placeholder="e.g. Oil filter P/N 51348"
          required
        />
      </Field>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Qty" htmlFor="part-qty">
          <Input
            id="part-qty"
            name="quantity"
            type="number"
            step="0.01"
            min={0.01}
            defaultValue={1}
            className="w-20"
          />
        </Field>
        <Field label="Cost each ($)" htmlFor="part-cost">
          <Input
            id="part-cost"
            name="unitCost"
            type="number"
            step="0.01"
            min={0}
            placeholder="0.00"
            className="w-28"
          />
        </Field>
        <SubmitButton variant="secondary">Add part</SubmitButton>
      </div>
      <FormError message={state?.error} />
    </form>
  );
}

export function RemovePartButton({
  workOrderId,
  partId,
}: {
  workOrderId: number;
  partId: number;
}) {
  const [state, formAction] = useActionState(removePartAction, undefined);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <input type="hidden" name="partId" value={partId} />
      <button
        type="submit"
        aria-label="Remove part line"
        title={state?.error ?? "Remove"}
        className="rounded px-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
      >
        ✕
      </button>
    </form>
  );
}

export function MeterReadingForm({
  workOrderId,
  meterId,
  unit,
  mustIncrease,
  lastValue,
}: {
  workOrderId: number;
  meterId: number;
  unit: string;
  mustIncrease: boolean;
  lastValue: string | null;
}) {
  const [state, formAction] = useActionState(addWoMeterReadingAction, undefined);
  return (
    <form action={formAction} className="space-y-1.5">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <input type="hidden" name="meterId" value={meterId} />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="value"
          type="number"
          step="any"
          required
          inputMode="decimal"
          placeholder={lastValue != null ? `last ${lastValue}` : "reading"}
          aria-label={`New reading (${unit})`}
          className="w-32"
        />
        <span className="text-sm text-gray-500">{unit}</span>
        <SubmitButton variant="secondary">Record</SubmitButton>
      </div>
      {mustIncrease ? (
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          <input type="checkbox" name="isRollover" value="1" className="h-3.5 w-3.5" />
          Meter rolled over (reading restarted from zero)
        </label>
      ) : null}
      <FormError message={state?.error} />
    </form>
  );
}
