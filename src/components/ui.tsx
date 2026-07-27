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
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
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
    "bg-blue-700 text-white hover:bg-blue-800 focus-visible:outline-blue-700",
  secondary:
    "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 focus-visible:outline-gray-500",
  danger:
    "bg-red-700 text-white hover:bg-red-800 focus-visible:outline-red-700",
  ghost: "text-blue-700 hover:bg-blue-50 focus-visible:outline-blue-700",
} as const;

type ButtonVariant = keyof typeof buttonStyles;

const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cx(buttonBase, buttonStyles[variant], className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return (
    <Link
      className={cx(buttonBase, buttonStyles[variant], className)}
      {...props}
    />
  );
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
  "block w-full min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-base shadow-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(fieldBase, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(fieldBase, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(fieldBase, "min-h-24", className)} {...props} />;
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
