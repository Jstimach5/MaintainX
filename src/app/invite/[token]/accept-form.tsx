"use client";

import { useActionState } from "react";
import { acceptInvitationAction } from "./actions";
import { Field, Input } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";

export function AcceptInvitationForm({
  token,
  suggestedUsername,
  displayName,
}: {
  token: string;
  suggestedUsername: string | null;
  displayName: string;
}) {
  const [state, formAction] = useActionState(acceptInvitationAction, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Your name" htmlFor="acc-name" required>
        <Input id="acc-name" name="displayName" defaultValue={displayName} required />
      </Field>
      <Field
        label="Username"
        htmlFor="acc-username"
        required
        hint={
          suggestedUsername
            ? "Suggested by your administrator — change it if you like"
            : "You'll sign in with this"
        }
      >
        <Input
          id="acc-username"
          name="username"
          defaultValue={suggestedUsername ?? ""}
          autoComplete="username"
          required
        />
      </Field>
      <Field label="Password" htmlFor="acc-password" required hint="At least 8 characters">
        <Input
          id="acc-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </Field>
      <Field label="Confirm password" htmlFor="acc-confirm" required>
        <Input
          id="acc-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      <p className="text-xs text-gray-500">
        This system is for your organization&apos;s internal maintenance
        records. Activity is logged under your account.
      </p>
      <FormError message={state?.error} />
      <SubmitButton>Activate my account</SubmitButton>
    </form>
  );
}
