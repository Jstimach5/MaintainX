"use client";

import { useActionState, useState } from "react";
import {
  addReadingAction,
  correctReadingAction,
  createMeterAction,
  createTriggerAction,
  updateMeterAction,
} from "./actions";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";

export function MeterForm({
  assets,
  locations,
  meter,
}: {
  assets: { id: number; label: string }[];
  locations: { id: number; label: string }[];
  meter?: {
    id: number;
    name: string;
    description: string | null;
    unit: string;
    assetId: number | null;
    locationId: number | null;
    mustIncrease: boolean;
    warnThreshold: string | null;
    criticalThreshold: string | null;
    isActive: boolean;
  };
}) {
  const [state, formAction] = useActionState(
    meter ? updateMeterAction : createMeterAction,
    undefined,
  );
  return (
    <form action={formAction} className="space-y-4">
      {meter ? <input type="hidden" name="meterId" value={meter.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Meter name" htmlFor="name" required>
          <Input id="name" name="name" defaultValue={meter?.name} required />
        </Field>
        <Field label="Unit" htmlFor="unit" required hint="hours, miles, cycles, °F, psi…">
          <Input id="unit" name="unit" defaultValue={meter?.unit} required />
        </Field>
      </div>
      <Field label="Description" htmlFor="description">
        <Textarea id="description" name="description" defaultValue={meter?.description ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Asset" htmlFor="assetId" hint="Attach to an asset or a location.">
          <Select id="assetId" name="assetId" defaultValue={meter?.assetId == null ? "" : String(meter.assetId)}>
            <option value="">— None —</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Location" htmlFor="locationId">
          <Select id="locationId" name="locationId" defaultValue={meter?.locationId == null ? "" : String(meter.locationId)}>
            <option value="">— None —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Reading direction" htmlFor="mustIncrease">
          <Select id="mustIncrease" name="mustIncrease" defaultValue={meter ? String(meter.mustIncrease) : "true"}>
            <option value="true">Always increases (hours, miles)</option>
            <option value="false">Can go up or down (temp, pressure)</option>
          </Select>
        </Field>
        <Field label="Warning threshold" htmlFor="warnThreshold">
          <Input id="warnThreshold" name="warnThreshold" type="number" step="any" defaultValue={meter?.warnThreshold ?? ""} />
        </Field>
        <Field label="Critical threshold" htmlFor="criticalThreshold">
          <Input id="criticalThreshold" name="criticalThreshold" type="number" step="any" defaultValue={meter?.criticalThreshold ?? ""} />
        </Field>
      </div>
      {meter ? (
        <Field label="Status" htmlFor="isActive">
          <Select id="isActive" name="isActive" defaultValue={meter.isActive ? "true" : "false"}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </Field>
      ) : null}
      <FormError message={state?.error} />
      <SubmitButton>{meter ? "Save meter" : "Create meter"}</SubmitButton>
    </form>
  );
}

export function ReadingForm({ meterId, unit }: { meterId: number; unit: string }) {
  const [state, formAction] = useActionState(addReadingAction, undefined);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="meterId" value={meterId} />
      <div className="flex flex-wrap items-end gap-2">
        <Field label={`New reading (${unit})`} htmlFor="value" required>
          <Input id="value" name="value" type="number" step="any" required className="w-40" />
        </Field>
        <SubmitButton>Save reading</SubmitButton>
      </div>
      <Input name="note" placeholder="Note (optional)" />
      <label className="flex items-center gap-1.5 text-sm text-gray-600">
        <input type="checkbox" name="isRollover" value="true" className="h-4 w-4" />
        The meter rolled over (reading restarted from zero)
      </label>
      <FormError message={state?.error} />
    </form>
  );
}

export function CorrectionForm({
  meterId,
  readingId,
  currentValue,
}: {
  meterId: number;
  readingId: number;
  currentValue: string;
}) {
  const [state, formAction] = useActionState(correctReadingAction, undefined);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-blue-700 hover:underline"
      >
        Correct
      </button>
    );
  }
  return (
    <form action={formAction} className="mt-1 flex flex-wrap items-end gap-2">
      <input type="hidden" name="meterId" value={meterId} />
      <input type="hidden" name="readingId" value={readingId} />
      <Input name="value" type="number" step="any" defaultValue={currentValue} className="w-28" aria-label="Corrected value" />
      <Input name="note" placeholder="Why? (required)" className="w-44" aria-label="Correction note" />
      <SubmitButton variant="secondary">Fix</SubmitButton>
      <FormError message={state?.error} />
    </form>
  );
}

export function TriggerForm({
  meterId,
  unit,
  procedures,
  teams,
}: {
  meterId: number;
  unit: string;
  procedures: { id: number; name: string }[];
  teams: { id: number; name: string }[];
}) {
  const [state, formAction] = useActionState(createTriggerAction, undefined);
  const [type, setType] = useState<"threshold" | "interval">("threshold");
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        + Add trigger
      </Button>
    );
  }
  return (
    <form action={formAction} className="space-y-3 rounded-md border border-gray-200 p-3">
      <input type="hidden" name="meterId" value={meterId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Trigger name" htmlFor="trigger-name" required>
          <Input id="trigger-name" name="name" required />
        </Field>
        <Field label="Type" htmlFor="trigger-type">
          <Select
            id="trigger-type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as "threshold" | "interval")}
          >
            <option value="threshold">Threshold (reaches a value)</option>
            <option value="interval">Interval (every N {unit})</option>
          </Select>
        </Field>
      </div>
      {type === "threshold" ? (
        <Field label={`Fire when reading reaches (${unit})`} htmlFor="threshold" required>
          <Input id="threshold" name="threshold" type="number" step="any" required />
        </Field>
      ) : (
        <Field label={`Fire every (${unit})`} htmlFor="intervalValue" required>
          <Input id="intervalValue" name="intervalValue" type="number" step="any" required />
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Work-order title" htmlFor="woTitle" required>
          <Input id="woTitle" name="woTitle" required />
        </Field>
        <Field label="Priority" htmlFor="trigger-priority">
          <Select id="trigger-priority" name="priority" defaultValue="medium">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
        </Field>
      </div>
      <Field label="Work-order description" htmlFor="woDescription">
        <Textarea id="woDescription" name="woDescription" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Attach procedure" htmlFor="trigger-procedure">
          <Select id="trigger-procedure" name="procedureTemplateId" defaultValue="">
            <option value="">— None —</option>
            {procedures.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Assign team" htmlFor="trigger-team">
          <Select id="trigger-team" name="assignedTeamId" defaultValue="">
            <option value="">— None —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <label className="flex items-center gap-1.5 text-sm text-gray-600">
        <input type="checkbox" name="skipIfOpen" value="true" defaultChecked className="h-4 w-4" />
        Don&apos;t fire again while the last generated work order is still open
      </label>
      <FormError message={state?.error} />
      <SubmitButton>Create trigger</SubmitButton>
    </form>
  );
}
