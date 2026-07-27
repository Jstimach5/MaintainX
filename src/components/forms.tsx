"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./ui";
import type { ComponentProps } from "react";

/** Standard result shape returned by server actions on failure. */
export type ActionResult = { error: string } | undefined;

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
    <div
      role="alert"
      data-testid="form-error"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      {message}
    </div>
  );
}
