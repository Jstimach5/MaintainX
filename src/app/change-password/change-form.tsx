"use client";

import { useActionState } from "react";
import { changePasswordAction } from "./actions";
import { Field, Input } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Current password" htmlFor="cp-current" required>
        <Input
          id="cp-current"
          name="current"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Field label="New password" htmlFor="cp-password" required hint="At least 8 characters">
        <Input
          id="cp-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </Field>
      <Field label="Confirm new password" htmlFor="cp-confirm" required>
        <Input
          id="cp-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      <FormError message={state?.error} />
      <SubmitButton>Save password</SubmitButton>
    </form>
  );
}
