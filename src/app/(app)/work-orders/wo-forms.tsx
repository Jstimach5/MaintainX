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
  timerAction,
  updateWorkOrderAction,
} from "./actions";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { Camera, Gauge, MessageSquare } from "@/components/icons";
import { ConfirmSubmit } from "@/components/dialog";
import { FormError, SubmitButton } from "@/components/forms";
import type { PickerData } from "@/server/services/pickers";

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
          ? btn(
              "in_progress",
              status === "paused" || status === "on_hold" || status === "waiting"
                ? "Resume work"
                : "Start work",
              "primary",
            )
          : null}
        {status === "in_progress" ||
        status === "paused" ||
        status === "on_hold" ||
        status === "waiting" ? (
          <Button type="button" onClick={() => setCompleting((v) => !v)}>
            Mark completed…
          </Button>
        ) : null}
        {status === "completed" ? btn("in_progress", "Reopen") : null}
        {canCancel && status !== "completed" && status !== "canceled" ? (
          <form action={formAction}>
            <input type="hidden" name="workOrderId" value={workOrderId} />
            <input type="hidden" name="status" value="canceled" />
            <ConfirmSubmit
              label="Cancel"
              title="Cancel this work order?"
              body="Canceled work is kept for the record but never counts as completed. You can reopen it afterwards if this was a mistake."
              confirmLabel="Cancel work order"
            />
          </form>
        ) : null}
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

/**
 * Sticky field action bar (small screens only). The job page is long —
 * this keeps the actions a technician needs mid-task within thumb reach,
 * so nobody scrolls back to the top to start work or save progress.
 * It sits directly above the bottom field navigation.
 */
export function FieldActionBar({
  workOrderId,
  status,
  canComplete,
}: {
  workOrderId: number;
  status: string;
  canComplete: boolean;
}) {
  const [state, formAction] = useActionState(changeWoStatusAction, undefined);
  const [completing, setCompleting] = useState(false);

  const isOpen = status !== "completed" && status !== "canceled";
  const jump = (
    href: string,
    Icon: typeof Camera,
    label: string,
  ) => (
    <a
      href={href}
      className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-2 text-[10px] font-medium text-gray-600 active:bg-gray-100"
    >
      <Icon aria-hidden className="h-4.5 w-4.5" />
      {label}
    </a>
  );

  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-gray-200 bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.06)] md:hidden">
      {completing ? (
        <form
          action={formAction}
          className="max-h-[60vh] space-y-3 overflow-y-auto border-b border-gray-200 p-3"
        >
          <input type="hidden" name="workOrderId" value={workOrderId} />
          <input type="hidden" name="status" value="completed" />
          <h2 className="text-sm font-semibold tracking-wide text-gray-900 uppercase">
            Complete this work order
          </h2>
          <Field label="Completion notes" htmlFor="field-completion-notes">
            <Textarea
              id="field-completion-notes"
              name="completionNotes"
              placeholder="What was done?"
            />
          </Field>
          <Field
            label="Actual downtime (minutes)"
            htmlFor="field-actual-downtime"
          >
            <Input
              id="field-actual-downtime"
              name="actualDowntimeMinutes"
              type="number"
              min={0}
              inputMode="numeric"
            />
          </Field>
          <div className="flex gap-2">
            <SubmitButton>Complete work order</SubmitButton>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCompleting(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <div className="flex items-center gap-1 px-2 py-1.5">
        {jump("#pictures", Camera, "Picture")}
        {jump("#notes", MessageSquare, "Note")}
        {jump("#readings", Gauge, "Reading")}
        <div className="ml-auto">
          {status !== "in_progress" && isOpen ? (
            <form action={formAction}>
              <input type="hidden" name="workOrderId" value={workOrderId} />
              <input type="hidden" name="status" value="in_progress" />
              <SubmitButton>Start work</SubmitButton>
            </form>
          ) : null}
          {status === "in_progress" && canComplete ? (
            <Button type="button" onClick={() => setCompleting((v) => !v)}>
              {completing ? "Close" : "Complete"}
            </Button>
          ) : null}
        </div>
      </div>
      <FormError message={state?.error} />
    </div>
  );
}

/**
 * Labor timer. Start when you walk up to the machine, pause when you step
 * away, stop when the job's labor is done — stopping writes the entry.
 */
export function TimerPanel({
  workOrderId,
  running,
  elapsedMinutes,
  runningElsewhere,
}: {
  workOrderId: number;
  running: boolean;
  elapsedMinutes: number;
  /** WO number of another job holding this user's only active timer. */
  runningElsewhere: string | null;
}) {
  const [state, formAction] = useActionState(timerAction, undefined);
  const label =
    elapsedMinutes >= 60
      ? `${Math.floor(elapsedMinutes / 60)}h ${elapsedMinutes % 60}m`
      : `${elapsedMinutes}m`;

  if (runningElsewhere) {
    return (
      <p className="text-sm text-amber-800">
        Your timer is running on {runningElsewhere}. Stop it there before
        starting one here.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      {running ? (
        <>
          <p className="text-sm">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-600 align-middle" />{" "}
            Running · <span className="font-semibold tabular-nums">{label}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              name="op"
              value="pause"
              className="min-h-11 rounded-md border border-gray-300 px-4 text-sm font-semibold active:bg-gray-100"
            >
              Pause
            </button>
            <button
              type="submit"
              name="op"
              value="stop"
              className="min-h-11 rounded-md bg-brand-800 px-4 text-sm font-semibold text-white active:bg-brand-900"
            >
              Stop &amp; log time
            </button>
          </div>
        </>
      ) : (
        <>
          {elapsedMinutes > 0 ? (
            <p className="text-sm text-gray-600">
              Paused at <span className="font-semibold tabular-nums">{label}</span>
            </p>
          ) : null}
          <button
            type="submit"
            name="op"
            value="start"
            className="min-h-11 rounded-md bg-brand-800 px-4 text-sm font-semibold text-white active:bg-brand-900"
          >
            {elapsedMinutes > 0 ? "Resume timer" : "Start timer"}
          </button>
        </>
      )}
      <FormError message={state?.error} />
    </form>
  );
}

/**
 * Pause / hold / waiting-for-parts, each with the required reason. Kept
 * separate from the quick bar so the reason field has room to breathe.
 */
export function PauseHoldForm({
  workOrderId,
  status,
}: {
  workOrderId: number;
  status: string;
}) {
  const [state, formAction] = useActionState(changeWoStatusAction, undefined);
  const [target, setTarget] = useState("paused");
  if (status !== "in_progress" && status !== "paused" && status !== "on_hold" && status !== "waiting") {
    return null;
  }
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <Field label="Interrupt this job" htmlFor="pause-target">
        <Select
          id="pause-target"
          name="status"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="paused">Paused — stepping away</option>
          <option value="on_hold">On hold — blocked</option>
          <option value="waiting">Waiting for parts</option>
        </Select>
      </Field>
      <Input name="note" placeholder="Why? (required)" required />
      <SubmitButton variant="secondary">Save</SubmitButton>
      <FormError message={state?.error} />
    </form>
  );
}

/** Manager review of work a technician submitted for approval. */
export function ApprovalPanel({ workOrderId }: { workOrderId: number }) {
  const [state, formAction] = useActionState(changeWoStatusAction, undefined);
  return (
    <div className="space-y-2">
      <p className="text-sm text-purple-900">
        A technician submitted this as finished. Approve it, or send it back
        with what still needs doing.
      </p>
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="workOrderId" value={workOrderId} />
        <Input name="note" placeholder="Note (required to send back)" />
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="status"
            value="completed"
            className="min-h-11 rounded-md bg-green-700 px-4 text-sm font-semibold text-white active:bg-green-800"
          >
            Approve &amp; complete
          </button>
          <button
            type="submit"
            name="status"
            value="in_progress"
            className="min-h-11 rounded-md border border-gray-300 px-4 text-sm font-semibold active:bg-gray-100"
          >
            Send back to technician
          </button>
        </div>
      </form>
      <FormError message={state?.error} />
    </div>
  );
}
