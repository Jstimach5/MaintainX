"use client";

import { useActionState } from "react";
import {
  createUserAction,
  resetPasswordAction,
  updateUserAction,
} from "./actions";
import { Field, Input, Select } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";

const ROLES = [
  { value: "admin", label: "Administrator" },
  { value: "manager", label: "Manager" },
  { value: "technician", label: "Technician" },
  { value: "requester", label: "Requester" },
];

export function CreateUserForm() {
  const [state, formAction] = useActionState(createUserAction, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Username" htmlFor="username" required>
        <Input id="username" name="username" autoCapitalize="none" required />
      </Field>
      <Field label="Display name" htmlFor="displayName" required>
        <Input id="displayName" name="displayName" required />
      </Field>
      <Field label="Email" htmlFor="email" hint="Optional — used for notifications if email is configured later.">
        <Input id="email" name="email" type="email" />
      </Field>
      <Field label="Role" htmlFor="role" required>
        <Select id="role" name="role" defaultValue="technician">
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Initial password" htmlFor="password" required hint="At least 8 characters. Share it securely; the user can't change it themselves yet.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <FormError message={state?.error} />
      <SubmitButton>Create user</SubmitButton>
    </form>
  );
}

export function EditUserForm({
  user,
}: {
  user: {
    id: number;
    username: string;
    displayName: string;
    email: string | null;
    role: string;
  };
}) {
  const [state, formAction] = useActionState(updateUserAction, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="userId" value={user.id} />
      <Field label="Username">
        <Input value={user.username} disabled />
      </Field>
      <Field label="Display name" htmlFor="displayName" required>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={user.displayName}
          required
        />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" defaultValue={user.email ?? ""} />
      </Field>
      <Field label="Role" htmlFor="role" required>
        <Select id="role" name="role" defaultValue={user.role}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <FormError message={state?.error} />
      <SubmitButton>Save changes</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ userId }: { userId: number }) {
  const [state, formAction] = useActionState(resetPasswordAction, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />
      <Field
        label="New password"
        htmlFor="password"
        required
        hint="Resetting signs the user out of every device."
      >
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <FormError message={state?.error} />
      <SubmitButton variant="secondary">Reset password</SubmitButton>
    </form>
  );
}
