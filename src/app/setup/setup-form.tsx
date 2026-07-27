"use client";

import { useActionState } from "react";
import { setupAction } from "./actions";
import { Field, Input, Select } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";

export function SetupForm({
  timezones,
  defaultTimezone,
}: {
  timezones: string[];
  defaultTimezone: string;
}) {
  const [state, formAction] = useActionState(setupAction, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Organization name" htmlFor="orgName" required>
        <Input id="orgName" name="orgName" required />
      </Field>
      <Field
        label="Timezone"
        htmlFor="timezone"
        required
        hint="Due dates and maintenance schedules use this timezone."
      >
        <Select id="timezone" name="timezone" defaultValue={defaultTimezone}>
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </Field>
      <hr className="border-gray-200" />
      <p className="text-sm font-semibold text-gray-700">
        Administrator account
      </p>
      <Field label="Username" htmlFor="username" required>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          required
        />
      </Field>
      <Field label="Display name" htmlFor="displayName" required>
        <Input id="displayName" name="displayName" required />
      </Field>
      <Field label="Password" htmlFor="password" required hint="At least 8 characters">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      <Field label="Confirm password" htmlFor="passwordConfirm" required>
        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      <FormError message={state?.error} />
      <SubmitButton className="w-full" pendingText="Setting up…">
        Create organization
      </SubmitButton>
    </form>
  );
}
