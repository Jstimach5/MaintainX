"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "./actions";
import { Field, Input } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";

export function ResetForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(resetPasswordAction, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="rp-password" required hint="At least 8 characters">
        <Input
          id="rp-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </Field>
      <Field label="Confirm new password" htmlFor="rp-confirm" required>
        <Input
          id="rp-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      <FormError message={state?.error} />
      <SubmitButton>Save new password</SubmitButton>
    </form>
  );
}
