"use client";

import { useActionState } from "react";
import { portalSubmitAction } from "./actions";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";

export function PortalForm({
  token,
  locations,
  assets,
  defaultAssetId,
}: {
  token: string;
  locations: { id: number; label: string; depth: number }[];
  assets: { id: number; label: string }[];
  defaultAssetId?: number;
}) {
  const [state, formAction] = useActionState(portalSubmitAction, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="What needs attention?" htmlFor="title" required>
        <Input id="title" name="title" required placeholder="Short summary" />
      </Field>
      <Field label="Details" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          placeholder="What's wrong? Where exactly? Anything unsafe?"
        />
      </Field>
      <Field label="Your name" htmlFor="requesterName" required>
        <Input id="requesterName" name="requesterName" required autoComplete="name" />
      </Field>
      <Field label="Phone or email" htmlFor="requesterContact" hint="So the team can reach you with questions or updates.">
        <Input id="requesterContact" name="requesterContact" />
      </Field>
      <Field label="Location (if known)" htmlFor="locationId">
        <Select id="locationId" name="locationId" defaultValue="">
          <option value="">— Not sure —</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {" ".repeat(l.depth * 3)}
              {l.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Equipment (if known)" htmlFor="assetId">
        <Select
          id="assetId"
          name="assetId"
          defaultValue={defaultAssetId != null ? String(defaultAssetId) : ""}
        >
          <option value="">— Not sure —</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="How urgent?" htmlFor="priority">
        <Select id="priority" name="priority" defaultValue="medium">
          <option value="low">Low — when convenient</option>
          <option value="medium">Medium</option>
          <option value="high">High — affecting work</option>
          <option value="critical">Critical / safety hazard</option>
        </Select>
      </Field>
      <Field label="Pictures" htmlFor="photos" hint="Up to 5 photos help the team fix it faster.">
        <input
          id="photos"
          type="file"
          name="photos"
          accept="image/*"
          capture="environment"
          multiple
          className="block w-full text-sm"
        />
      </Field>
      <FormError message={state?.error} />
      <SubmitButton className="w-full" pendingText="Submitting…">
        Submit request
      </SubmitButton>
    </form>
  );
}
