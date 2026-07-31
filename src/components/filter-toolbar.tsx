"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "@/components/icons";

/**
 * List-page filter bar. The controls render exactly once: from `md` up
 * they are always visible (the toggle is hidden), and on phones they
 * collapse behind it — the stress captures showed five selects plus
 * checkboxes eating ~70% of a 360px viewport before a single record.
 *
 * `activeCount` keeps a collapsed bar honest: the summary always states
 * how many filters are on, so a narrowed list is never mistaken for the
 * whole list.
 */
export function FilterToolbar({
  action,
  activeCount = 0,
  defaultOpen,
  children,
}: {
  /** Optional GET target; defaults to the current path. */
  action?: string;
  /** Number of filters currently applied — always shown on the toggle. */
  activeCount?: number;
  /**
   * Whether phones start expanded. Defaults to "something is filtered".
   * Pass it explicitly where a param comes from the entry point rather
   * than the user: the technician's Work tab always carries `mine=1`,
   * and expanding every time would bury the list it exists to show.
   */
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? activeCount > 0);
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 md:hidden"
      >
        <SlidersHorizontal aria-hidden className="h-4 w-4 text-gray-500" />
        Filters
        {activeCount > 0 ? (
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-900">
            {activeCount} active
          </span>
        ) : null}
      </button>
      <form
        method="get"
        action={action}
        className={`${open ? "mt-2 flex" : "hidden"} flex-wrap items-center gap-2 md:mt-0 md:flex`}
      >
        {children}
      </form>
    </div>
  );
}
