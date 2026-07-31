"use client";

import { useActionState } from "react";
import {
  createLocationAction,
  createSiteAction,
  updateLocationAction,
  updateSiteAction,
} from "./actions";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";

export function SiteForm({
  site,
}: {
  site?: {
    id: number;
    name: string;
    code: string | null;
    address: string | null;
    description: string | null;
    isActive: boolean;
  };
}) {
  const [state, formAction] = useActionState(
    site ? updateSiteAction : createSiteAction,
    undefined,
  );
  return (
    <form action={formAction} className="space-y-4">
      {site ? <input type="hidden" name="siteId" value={site.id} /> : null}
      <Field label="Site name" htmlFor="name" required>
        <Input id="name" name="name" defaultValue={site?.name} required />
      </Field>
      <Field label="Code" htmlFor="code" hint="Short internal code, e.g. MAIN">
        <Input id="code" name="code" defaultValue={site?.code ?? ""} />
      </Field>
      <Field label="Address" htmlFor="address">
        <Input id="address" name="address" defaultValue={site?.address ?? ""} />
      </Field>
      <Field label="Description" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          defaultValue={site?.description ?? ""}
        />
      </Field>
      {site ? (
        <Field
          label="Status"
          htmlFor="isActive"
          hint="Archiving hides this site (and all its locations) from pickers. History is kept."
        >
          <Select
            id="isActive"
            name="isActive"
            defaultValue={site.isActive ? "true" : "false"}
          >
            <option value="true">Active</option>
            <option value="false">Archived</option>
          </Select>
        </Field>
      ) : null}
      <FormError message={state?.error} />
      <SubmitButton>{site ? "Save site" : "Create site"}</SubmitButton>
    </form>
  );
}

export type LocationOption = { id: number; label: string; depth: number };

function ParentSelect({
  options,
  defaultValue,
  excludeId,
}: {
  options: LocationOption[];
  defaultValue?: number | null;
  excludeId?: number;
}) {
  return (
    <Select
      id="parentId"
      name="parentId"
      defaultValue={defaultValue == null ? "" : String(defaultValue)}
    >
      <option value="">— Top level —</option>
      {options
        .filter((o) => o.id !== excludeId)
        .map((o) => (
          <option key={o.id} value={o.id}>
            {" ".repeat(o.depth * 3)}
            {o.label}
          </option>
        ))}
    </Select>
  );
}

export function LocationForm({
  siteId,
  options,
  location,
  defaultParentId,
}: {
  siteId: number;
  options: LocationOption[];
  location?: {
    id: number;
    name: string;
    code: string | null;
    description: string | null;
    parentId: number | null;
    isActive: boolean;
  };
  defaultParentId?: number | null;
}) {
  const [state, formAction] = useActionState(
    location ? updateLocationAction : createLocationAction,
    undefined,
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="siteId" value={siteId} />
      {location ? (
        <input type="hidden" name="locationId" value={location.id} />
      ) : null}
      <Field label="Location name" htmlFor="name" required>
        <Input id="name" name="name" defaultValue={location?.name} required />
      </Field>
      <Field label="Code" htmlFor="code">
        <Input id="code" name="code" defaultValue={location?.code ?? ""} />
      </Field>
      <Field label="Parent location" htmlFor="parentId">
        <ParentSelect
          options={options}
          defaultValue={location ? location.parentId : defaultParentId}
          excludeId={location?.id}
        />
      </Field>
      <Field label="Description" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          defaultValue={location?.description ?? ""}
        />
      </Field>
      {location ? (
        <Field
          label="Status"
          htmlFor="isActive"
          hint="Archiving also archives everything nested under this location."
        >
          <Select
            id="isActive"
            name="isActive"
            defaultValue={location.isActive ? "true" : "false"}
          >
            <option value="true">Active</option>
            <option value="false">Archived</option>
          </Select>
        </Field>
      ) : null}
      <FormError message={state?.error} />
      <SubmitButton>
        {location ? "Save location" : "Add location"}
      </SubmitButton>
    </form>
  );
}
