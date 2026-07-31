import type { ReactNode } from "react";

/**
 * Page-layout templates (docs/UI_REDESIGN_PLAN.md D-5). The app shell
 * provides gutters only; every converted page picks exactly one of these,
 * so width is a per-family decision, never a global cap:
 *
 * - DashboardGrid — 12-column grid, wide cap, for at-a-glance pages
 * - ListLayout    — wide cap for tables/lists that earn their width
 * - DetailLayout  — main column + sticky status/action rail at lg+
 * - FormLayout    — readable narrow column for data entry
 *
 * Pages not yet converted live under the (classic) route group instead.
 */

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * 12-column dashboard canvas. Children place themselves with col-span
 * utilities (e.g. `col-span-12 sm:col-span-6 xl:col-span-3`); every region
 * must earn its slot with a decision or an action — no decorative tiles.
 */
export function DashboardGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "mx-auto grid w-full max-w-[1600px] grid-cols-12 gap-4 xl:gap-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Wide content area for lists and tables that use the width for columns. */
export function ListLayout({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mx-auto w-full max-w-[1500px]", className)}>
      {children}
    </div>
  );
}

/**
 * Record page: header spans full width; below lg everything stacks with
 * the rail after the main column; at lg+ the rail sits sticky beside it
 * (top offset clears the sticky app header).
 */
export function DetailLayout({
  header,
  rail,
  children,
  className,
}: {
  /** Title block, breadcrumbs, status chips, page-level actions. */
  header?: ReactNode;
  /** Status/actions column; omit for single-column detail pages. */
  rail?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mx-auto w-full max-w-[1500px]", className)}>
      {header}
      {rail ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-6">
          <div className="min-w-0 space-y-4">{children}</div>
          <aside className="space-y-4 lg:sticky lg:top-20">{rail}</aside>
        </div>
      ) : (
        <div className="space-y-4">{children}</div>
      )}
    </div>
  );
}

/** Readable column for create/edit forms — data entry never goes wide. */
export function FormLayout({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mx-auto w-full max-w-2xl", className)}>{children}</div>
  );
}
