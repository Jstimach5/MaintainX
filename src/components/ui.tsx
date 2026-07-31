import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * Minimal shared UI primitives. Mobile-first: 44px+ touch targets, 16px
 * inputs (prevents iOS zoom-on-focus), high-contrast labels.
 */

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        {subtitle ? <p className="text-sm text-gray-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  /** Anchor target — the field action bar jumps to these sections. */
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cx(
        "rounded-lg border border-gray-200 bg-white p-4 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

const buttonStyles = {
  primary:
    "bg-brand-800 text-white hover:bg-brand-900 focus-visible:outline-brand-800",
  secondary:
    "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 focus-visible:outline-gray-500",
  danger:
    "bg-red-700 text-white hover:bg-red-800 focus-visible:outline-red-700",
  ghost: "text-brand-800 hover:bg-brand-50 focus-visible:outline-brand-800",
} as const;

type ButtonVariant = keyof typeof buttonStyles;

const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";

/** Button classes for elements that can't be `Button`/`ButtonLink` (e.g. plain `<a download>`). */
export function buttonClasses(variant: ButtonVariant = "primary", className?: string) {
  return cx(buttonBase, buttonStyles[variant], className);
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={buttonClasses(variant, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={buttonClasses(variant, className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cx("mb-1 block text-sm font-medium text-gray-700", className)}
      {...props}
    />
  );
}

const fieldBase =
  "min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-base shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";

/** `inline` skips `block w-full` — for filter toolbars where controls size to content. */
export function Input({
  inline,
  className,
  ...props
}: ComponentProps<"input"> & { inline?: boolean }) {
  return (
    <input
      className={cx(!inline && "block w-full", fieldBase, className)}
      {...props}
    />
  );
}

export function Select({
  inline,
  className,
  ...props
}: ComponentProps<"select"> & { inline?: boolean }) {
  return (
    <select
      className={cx(!inline && "block w-full", fieldBase, className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cx("block w-full min-h-24", fieldBase, className)}
      {...props}
    />
  );
}

export function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </Label>
      {children}
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

const badgeTones = {
  gray: "bg-gray-100 text-gray-800",
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-900",
  red: "bg-red-100 text-red-800",
  blue: "bg-blue-100 text-blue-800",
  purple: "bg-purple-100 text-purple-800",
} as const;

export type BadgeTone = keyof typeof badgeTones;

export function Badge({
  tone = "gray",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const alertTones = {
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  success: "border-green-200 bg-green-50 text-green-800",
  info: "border-blue-200 bg-blue-50 text-blue-900",
} as const;

export type AlertTone = keyof typeof alertTones;

/**
 * Inline notice box — the single shape for error/success/warning banners.
 * Live-region policy: dynamic errors get role="alert" (built in); dynamic
 * success messages should add role="status"; static tinted boxes stay inert.
 */
export function Alert({
  tone = "info",
  className,
  ...props
}: ComponentProps<"div"> & { tone?: AlertTone }) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cx(
        "rounded-md border px-3 py-2 text-sm",
        alertTones[tone],
        className,
      )}
      {...props}
    />
  );
}

/**
 * Dashboard stat tile (server-safe; icons render inline). The whole tile
 * is the link. Tones color the value only — meaning also lives in the
 * label, never color alone.
 */
export function KpiTile({
  label,
  value,
  href,
  icon,
  tone = "default",
  className,
}: {
  label: string;
  value: string | number;
  href?: string;
  icon?: ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
  className?: string;
}) {
  const valueColor =
    tone === "bad"
      ? "text-red-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "good"
          ? "text-green-700"
          : "text-gray-900";
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={cx("text-2xl font-bold tabular-nums", valueColor)}>
          {value}
        </p>
        {icon ? (
          <span
            aria-hidden
            className="rounded-md bg-brand-50 p-1.5 text-brand-800 [&>svg]:h-4 [&>svg]:w-4"
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
        {label}
      </p>
    </>
  );
  const base = "block rounded-lg border border-gray-200 bg-white p-3 shadow-sm";
  return href ? (
    <Link
      href={href}
      className={cx(
        base,
        "transition hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 active:bg-gray-50",
        className,
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={cx(base, className)}>{body}</div>
  );
}

/** Loading placeholder block — pair with route loading.tsx files. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cx("animate-pulse rounded-md bg-gray-200", className)}
      {...props}
    />
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
      <p className="font-medium text-gray-700">{title}</p>
      {hint ? <p className="mt-1 text-sm text-gray-500">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
