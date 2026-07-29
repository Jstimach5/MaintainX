"use client";

import { useActionState } from "react";
import { forgotPasswordAction } from "./actions";
import { Field, Input } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";

export function ForgotForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, undefined);
  if (state?.done) {
    return (
      <p className="rounded-md bg-green-50 p-3 text-sm text-green-800" data-testid="forgot-done">
        If that matches an account with an email address, a reset link is on
        its way. The link works once and expires in an hour.
      </p>
    );
  }
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Username or email" htmlFor="fp-id" required>
        <Input id="fp-id" name="identifier" required autoComplete="username" />
      </Field>
      <FormError message={state?.error} />
      <SubmitButton>Send reset link</SubmitButton>
    </form>
  );
}
