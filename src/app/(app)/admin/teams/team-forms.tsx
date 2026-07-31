"use client";

import { useActionState } from "react";
import { createTeamAction, updateTeamAction } from "./actions";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";

export function CreateTeamForm() {
  const [state, formAction] = useActionState(createTeamAction, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Team name" htmlFor="name" required>
        <Input id="name" name="name" required />
      </Field>
      <Field label="Description" htmlFor="description">
        <Textarea id="description" name="description" />
      </Field>
      <FormError message={state?.error} />
      <SubmitButton>Create team</SubmitButton>
    </form>
  );
}

export function EditTeamForm({
  team,
  allUsers,
}: {
  team: {
    id: number;
    name: string;
    description: string | null;
    isActive: boolean;
    memberIds: number[];
  };
  allUsers: { id: number; displayName: string; role: string; isActive: boolean }[];
}) {
  const [state, formAction] = useActionState(updateTeamAction, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="teamId" value={team.id} />
      <Field label="Team name" htmlFor="name" required>
        <Input id="name" name="name" defaultValue={team.name} required />
      </Field>
      <Field label="Description" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          defaultValue={team.description ?? ""}
        />
      </Field>
      <Field label="Status" htmlFor="isActive">
        <Select
          id="isActive"
          name="isActive"
          defaultValue={team.isActive ? "true" : "false"}
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-gray-700">
          Members
        </legend>
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
          {allUsers.map((u) => (
            <label
              key={u.id}
              className="flex min-h-10 cursor-pointer items-center gap-2 rounded px-2 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                name="memberIds"
                value={u.id}
                defaultChecked={team.memberIds.includes(u.id)}
                className="h-4 w-4"
              />
              <span className="text-sm">
                {u.displayName}
                <span className="text-gray-500"> · {u.role}</span>
                {!u.isActive ? (
                  <span className="text-red-600"> (deactivated)</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <FormError message={state?.error} />
      <SubmitButton>Save team</SubmitButton>
    </form>
  );
}
