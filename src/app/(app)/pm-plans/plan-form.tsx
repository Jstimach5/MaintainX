"use client";

import { useActionState, useState } from "react";
import { createPlanAction, updatePlanAction } from "./actions";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";
import type { PickerData } from "../assets/asset-forms";

export type PlanFormData = {
  picker: PickerData;
  assetsBySite: Record<number, { id: number; label: string }[]>;
  teams: { id: number; name: string }[];
  people: { id: number; displayName: string }[];
  procedures: { id: number; name: string }[];
};

export type PlanFormValues = {
  id: number;
  name: string;
  description: string | null;
  siteId: number;
  locationId: number | null;
  assetId: number | null;
  assignedTeamId: number | null;
  assigneeIds: number[] | null;
  procedureTemplateId: number | null;
  priority: string;
  estimatedMinutes: number | null;
  plannedDowntimeMinutes: number | null;
  basis: string;
  recurUnit: string;
  recurInterval: number;
  leadDays: number;
  startDate: string;
  endDate: string | null;
  nextDue: string;
  isPaused: boolean;
};

export function PlanForm({
  data,
  plan,
}: {
  data: PlanFormData;
  plan?: PlanFormValues;
}) {
  const [state, formAction] = useActionState(
    plan ? updatePlanAction : createPlanAction,
    undefined,
  );
  const [siteId, setSiteId] = useState<number | null>(plan?.siteId ?? null);
  const siteLocations = siteId != null ? (data.picker.locationsBySite[siteId] ?? []) : [];
  const siteAssets = siteId != null ? (data.assetsBySite[siteId] ?? []) : [];

  return (
    <form action={formAction} className="space-y-4">
      {plan ? <input type="hidden" name="planId" value={plan.id} /> : null}
      <Field label="Plan name (becomes the work-order title)" htmlFor="name" required>
        <Input id="name" name="name" defaultValue={plan?.name} required />
      </Field>
      <Field label="Description / instructions" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          defaultValue={plan?.description ?? ""}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Site" htmlFor="siteId" required>
          <Select
            id="siteId"
            name="siteId"
            value={siteId == null ? "" : String(siteId)}
            onChange={(e) => setSiteId(e.target.value ? Number(e.target.value) : null)}
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
            defaultValue={plan?.locationId == null ? "" : String(plan.locationId)}
          >
            <option value="">— None —</option>
            {siteLocations.map((o) => (
              <option key={o.id} value={o.id}>
                {" ".repeat(o.depth * 3)}
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Asset" htmlFor="assetId">
          <Select
            id="assetId"
            name="assetId"
            defaultValue={plan?.assetId == null ? "" : String(plan.assetId)}
          >
            <option value="">— None —</option>
            {siteAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Procedure to attach" htmlFor="procedureTemplateId">
          <Select
            id="procedureTemplateId"
            name="procedureTemplateId"
            defaultValue={
              plan?.procedureTemplateId == null
                ? ""
                : String(plan.procedureTemplateId)
            }
          >
            <option value="">— None —</option>
            {data.procedures.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="rounded-lg border border-gray-200 p-3">
        <legend className="px-1 text-sm font-semibold">Schedule</legend>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Every" htmlFor="recurInterval">
            <Input
              id="recurInterval"
              name="recurInterval"
              type="number"
              min={1}
              max={365}
              defaultValue={plan?.recurInterval ?? 1}
              className="w-20"
            />
          </Field>
          <Field label="Unit" htmlFor="recurUnit">
            <Select id="recurUnit" name="recurUnit" defaultValue={plan?.recurUnit ?? "month"}>
              <option value="day">day(s)</option>
              <option value="week">week(s)</option>
              <option value="month">month(s)</option>
              <option value="year">year(s)</option>
            </Select>
          </Field>
          <Field
            label="Schedule type"
            htmlFor="basis"
            hint="Floating: next due counts from completion. Fixed: due dates stay on the original calendar."
          >
            <Select id="basis" name="basis" defaultValue={plan?.basis ?? "floating"}>
              <option value="floating">Floating (from last completion)</option>
              <option value="fixed">Fixed (original due dates)</option>
            </Select>
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label="First due date" htmlFor="startDate" required>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              defaultValue={plan?.startDate}
              required
            />
          </Field>
          <Field label="End date (optional)" htmlFor="endDate">
            <Input
              id="endDate"
              name="endDate"
              type="date"
              defaultValue={plan?.endDate ?? ""}
            />
          </Field>
          <Field
            label="Create work order (days early)"
            htmlFor="leadDays"
            hint="0 = on the due date"
          >
            <Input
              id="leadDays"
              name="leadDays"
              type="number"
              min={0}
              max={365}
              defaultValue={plan?.leadDays ?? 0}
              className="w-24"
            />
          </Field>
          {plan ? (
            <Field label="Next due (re-anchor)" htmlFor="nextDue">
              <Input
                id="nextDue"
                name="nextDue"
                type="date"
                defaultValue={plan.nextDue}
              />
            </Field>
          ) : null}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Priority" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue={plan?.priority ?? "medium"}>
            <option value="none">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
        </Field>
        <Field label="Estimated minutes" htmlFor="estimatedMinutes">
          <Input
            id="estimatedMinutes"
            name="estimatedMinutes"
            type="number"
            min={0}
            defaultValue={plan?.estimatedMinutes ?? ""}
          />
        </Field>
        <Field label="Planned downtime (min)" htmlFor="plannedDowntimeMinutes">
          <Input
            id="plannedDowntimeMinutes"
            name="plannedDowntimeMinutes"
            type="number"
            min={0}
            defaultValue={plan?.plannedDowntimeMinutes ?? ""}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Assign team" htmlFor="assignedTeamId">
          <Select
            id="assignedTeamId"
            name="assignedTeamId"
            defaultValue={plan?.assignedTeamId == null ? "" : String(plan.assignedTeamId)}
          >
            <option value="">— None —</option>
            {data.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="isPaused">
          <Select
            id="isPaused"
            name="isPaused"
            defaultValue={plan?.isPaused ? "true" : "false"}
          >
            <option value="false">Active</option>
            <option value="true">Paused</option>
          </Select>
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-gray-700">Assign people</legend>
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
          {data.people.map((p) => (
            <label key={p.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 hover:bg-gray-50">
              <input
                type="checkbox"
                name="assigneeIds"
                value={p.id}
                defaultChecked={plan?.assigneeIds?.includes(p.id)}
                className="h-4 w-4"
              />
              <span className="text-sm">{p.displayName}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <FormError message={state?.error} />
      <SubmitButton>{plan ? "Save plan" : "Create plan"}</SubmitButton>
    </form>
  );
}
