"use client";

import { useActionState, useState } from "react";
import {
  addRequestCommentAction,
  createRequestAction,
  decideRequestAction,
} from "./actions";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";
import type { PickerData } from "../assets/asset-forms";

export function RequestForm({
  picker,
  assetsBySite,
}: {
  picker: PickerData;
  assetsBySite: Record<number, { id: number; label: string }[]>;
}) {
  const [state, formAction] = useActionState(createRequestAction, undefined);
  const [siteId, setSiteId] = useState<number | null>(
    picker.sites.length === 1 ? picker.sites[0].id : null,
  );
  const siteLocations = siteId != null ? (picker.locationsBySite[siteId] ?? []) : [];
  const siteAssets = siteId != null ? (assetsBySite[siteId] ?? []) : [];

  return (
    <form action={formAction} className="space-y-4">
      <Field label="What needs attention?" htmlFor="title" required>
        <Input id="title" name="title" required placeholder="Short summary" />
      </Field>
      <Field label="Details" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          placeholder="What's wrong? When did it start? Anything unsafe?"
        />
      </Field>
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
        <Field label="Location (if known)" htmlFor="locationId">
          <Select id="locationId" name="locationId" defaultValue="">
            <option value="">— Not sure —</option>
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
        <Field label="Asset (if known)" htmlFor="assetId">
          <Select id="assetId" name="assetId" defaultValue="">
            <option value="">— Not sure —</option>
            {siteAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue="medium">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical / safety</option>
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="category">
          <Input id="category" name="category" placeholder="e.g. Electrical" />
        </Field>
        <Field label="Needed by" htmlFor="requestedCompletionDate">
          <Input
            id="requestedCompletionDate"
            name="requestedCompletionDate"
            type="date"
          />
        </Field>
      </div>
      <FormError message={state?.error} />
      <SubmitButton>Submit request</SubmitButton>
      <p className="text-xs text-gray-500">
        You can add pictures on the next screen after submitting.
      </p>
    </form>
  );
}

export function DecisionBar({
  requestId,
  status,
}: {
  requestId: number;
  status: string;
}) {
  const [state, formAction] = useActionState(decideRequestAction, undefined);
  const [declining, setDeclining] = useState(false);

  const btn = (decision: string, label: string, variant: "primary" | "secondary" | "danger" = "secondary") => (
    <form action={formAction}>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="decision" value={decision} />
      <SubmitButton variant={variant}>{label}</SubmitButton>
    </form>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "submitted" ? btn("under_review", "Start review") : null}
        {status === "submitted" || status === "under_review"
          ? btn("approved", "Approve", "primary")
          : null}
        {status === "approved" ? btn("convert", "Convert to work order", "primary") : null}
        {status !== "declined" && status !== "converted" ? (
          <button
            type="button"
            onClick={() => setDeclining((v) => !v)}
            className="inline-flex min-h-11 items-center rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
          >
            Decline…
          </button>
        ) : null}
      </div>
      {declining ? (
        <form action={formAction} className="space-y-2 rounded-md border border-red-200 p-3">
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="decision" value="declined" />
          <Field label="Reason (shown to the requester)" htmlFor="reason" required>
            <Input id="reason" name="reason" required />
          </Field>
          <SubmitButton variant="danger">Decline request</SubmitButton>
        </form>
      ) : null}
      <FormError message={state?.error} />
    </div>
  );
}

export function RequestCommentForm({
  requestId,
  canInternal,
}: {
  requestId: number;
  canInternal: boolean;
}) {
  const [state, formAction] = useActionState(addRequestCommentAction, undefined);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <Textarea name="body" placeholder="Add a comment…" required />
      {canInternal ? (
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" name="isInternal" value="true" className="h-4 w-4" />
          Internal note (hidden from the requester)
        </label>
      ) : null}
      <FormError message={state?.error} />
      <SubmitButton variant="secondary">Comment</SubmitButton>
    </form>
  );
}
