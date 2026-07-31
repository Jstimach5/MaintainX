"use client";

import { useFormStatus } from "react-dom";
import { Alert, Button } from "./ui";
import type { ComponentProps } from "react";

/** Standard result shape returned by server actions on failure. */
/** `{}` = success (no redirect); `{ error }` = show it; undefined = initial. */
export type ActionResult = { error?: string } | undefined;

export function SubmitButton({
  children,
  pendingText = "Saving…",
  ...props
}: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Alert tone="error" data-testid="form-error">
      {message}
    </Alert>
  );
}
