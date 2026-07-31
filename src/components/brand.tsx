/**
 * TEMPORARY MARK — recreated from a screenshot of sealtechinsulation.com
 * (silver "SEAL TECH" wordmark with a green faceted diamond, "INSULATION"
 * subline). This file is the single swap point: when the official logo
 * files arrive, drop them in public/brand/ and replace the internals of
 * these components — every call site (header, login, QR label) stays
 * unchanged. Keep src/app/icon.svg (favicon) in sync.
 */
import type { ComponentProps } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * The faceted-diamond app mark. Four green facets meeting at center —
 * grayscale-legible for print (facets keep distinct tones). Decorative:
 * always paired with visible text or an aria-label on the parent.
 */
export function DiamondMark({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <g stroke="#ffffff" strokeWidth="0.75" strokeLinejoin="round">
        <path d="M12 1 L3 12 L12 12 Z" fill="#81c784" />
        <path d="M12 1 L21 12 L12 12 Z" fill="#66bb6a" />
        <path d="M12 23 L21 12 L12 12 Z" fill="#4caf50" />
        <path d="M12 23 L3 12 L12 12 Z" fill="#2e7d32" />
      </g>
    </svg>
  );
}

/**
 * Horizontal lockup: SEAL ◆ TECH / INSULATION.
 * `onDark` for the brand-950 header; default suits white/gray surfaces
 * and the print-safe QR label (silver-gray text prints cleanly).
 * `compact` renders the diamond only (mobile header, tight slots).
 */
export function SealTechLogo({
  onDark = false,
  compact = false,
  className,
}: {
  onDark?: boolean;
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return <DiamondMark className={cx("h-6 w-6", className)} />;
  }
  return (
    <span className={cx("inline-flex flex-col leading-none", className)}>
      <span
        className={cx(
          "flex items-center gap-1 text-[15px] font-extrabold tracking-wide",
          onDark ? "text-gray-200" : "text-gray-600",
        )}
      >
        SEAL
        <DiamondMark className="h-4 w-4 shrink-0" />
        TECH
      </span>
      <span
        className={cx(
          "mt-0.5 text-center text-[7px] font-semibold tracking-[0.42em]",
          onDark ? "text-gray-300" : "text-gray-500",
        )}
      >
        INSULATION
      </span>
    </span>
  );
}
