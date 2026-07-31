import type { ReactNode } from "react";

/**
 * Legacy width wrapper — reproduces the original `max-w-6xl` shell for
 * pages that have not yet been converted to a layout template
 * (docs/UI_REDESIGN_PLAN.md D-5). Converted page families move out of
 * `(classic)` and pick their template width instead. Delete this group
 * when it is empty.
 */
export default function ClassicLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl">{children}</div>;
}
