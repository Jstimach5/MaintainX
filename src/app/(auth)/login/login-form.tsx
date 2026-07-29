"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";
import { Field, Input } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(loginAction, undefined);
  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="Username" htmlFor="username" required>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          required
        />
      </Field>
      <Field label="Password" htmlFor="password" required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <FormError message={state?.error} />
      <SubmitButton className="w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
      <p className="text-center text-sm">
        <a href="/forgot" className="text-blue-700 hover:underline">
          Forgot your password?
        </a>
      </p>
    </form>
  );
}
