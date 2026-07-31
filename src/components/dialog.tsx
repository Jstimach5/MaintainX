"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./ui";
import { TriangleAlert, X } from "./icons";

/**
 * Modal built on the native <dialog> element: focus trapping, Escape, and
 * the top layer come from the platform, so there is no focus-management
 * code here to get wrong.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  if (!open) return null;
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby={titleId}
      className="m-auto w-[calc(100vw-2rem)] max-w-md rounded-lg border border-gray-200 p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-4 py-3">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-m-1 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
      {children ? <div className="px-4 py-3 text-sm">{children}</div> : null}
      {footer ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-4 py-3">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}

/**
 * Confirmation gate for irreversible actions. Drop it inside the form that
 * performs the action: the visible button opens the dialog and submits
 * nothing, and only the dialog's confirm button submits the form.
 */
export function ConfirmSubmit({
  label,
  title,
  body,
  confirmLabel,
  variant = "danger",
}: {
  /** Text on the trigger button. */
  label: string;
  title: string;
  body: string;
  /** Text on the confirming button; defaults to the trigger label. */
  confirmLabel?: string;
  variant?: "danger" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /**
   * Submit explicitly rather than relying on a `type="submit"` button
   * inside the dialog: closing the dialog unmounts that button, and a
   * button removed mid-click never submits. requestSubmit() dispatches
   * first, then the close is safe.
   */
  const confirm = () => {
    triggerRef.current?.form?.requestSubmit();
    setOpen(false);
  };

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant={variant}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={confirm}>
              {confirmLabel ?? label}
            </Button>
          </>
        }
      >
        <p className="flex gap-2">
          <TriangleAlert
            aria-hidden
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
          />
          {body}
        </p>
      </Dialog>
    </>
  );
}
