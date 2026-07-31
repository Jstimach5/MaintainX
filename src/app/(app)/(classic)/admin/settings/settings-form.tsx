"use client";

import { useActionState } from "react";
import { updateSettingsAction } from "./actions";
import { Field, Input, Select } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";

export function SettingsForm({
  timezones,
  current,
}: {
  timezones: string[];
  current: {
    name: string;
    timezone: string;
    requireCompletionApproval: boolean;
  };
}) {
  const [state, formAction] = useActionState(updateSettingsAction, undefined);
  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <Field label="Organization name" htmlFor="org-name" required>
        <Input id="org-name" name="name" defaultValue={current.name} required />
      </Field>
      <Field
        label="Timezone"
        htmlFor="org-tz"
        required
        hint="Due dates, calendars, and maintenance schedules all follow this zone."
      >
        <Select id="org-tz" name="timezone" defaultValue={current.timezone}>
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-gray-200 p-3">
        <input
          type="checkbox"
          name="requireCompletionApproval"
          defaultChecked={current.requireCompletionApproval}
          className="mt-0.5 h-5 w-5"
        />
        <span>
          <span className="block text-sm font-medium">
            Require manager approval of completed work
          </span>
          <span className="block text-sm text-gray-500">
            When on, a technician finishing a job sends it to a manager for
            approval (&ldquo;Waiting for approval&rdquo;) instead of
            completing it directly. Managers approve or send it back with a
            note.
          </span>
        </span>
      </label>
      <SubmitButton>Save settings</SubmitButton>
      <FormError message={state?.error} />
    </form>
  );
}
