"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";

/**
 * Chart primitives following the dataviz method: single-measure categorical
 * bars use ONE hue (identity lives in the row label, not color); values are
 * direct-labeled; text wears text tokens; grid/axes recessive; line charts
 * ship a crosshair + tooltip hover layer.
 */

const BAR_HUE = "#43a047"; // brand-600 — the app's single sequential hue

export function StatTile({
  label,
  value,
  href,
  tone = "default",
}: {
  label: string;
  value: string | number;
  href?: string;
  tone?: "default" | "bad" | "good";
}) {
  const valueColor =
    tone === "bad" ? "text-red-700" : tone === "good" ? "text-green-700" : "text-gray-900";
  const body = (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-brand-300">
      <p className={`text-2xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      <p className="mt-0.5 text-sm text-gray-500">{label}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function BarRows({
  rows,
  unit = "",
}: {
  rows: { label: string; value: number; href?: string }[];
  unit?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-sm">
          <span className="w-32 shrink-0 truncate text-gray-600">
            {r.href ? (
              <Link href={r.href} className="hover:underline">
                {r.label}
              </Link>
            ) : (
              r.label
            )}
          </span>
          <span className="relative h-4 min-w-0 flex-1 rounded-r-[4px] bg-gray-100">
            <span
              className="absolute inset-y-0 left-0 rounded-r-[4px]"
              style={{
                width: `${(r.value / max) * 100}%`,
                backgroundColor: BAR_HUE,
              }}
            />
          </span>
          <span className="w-10 shrink-0 text-right font-medium tabular-nums">
            {r.value}
            {unit}
          </span>
        </div>
      ))}
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">No data in this range.</p>
      ) : null}
    </div>
  );
}

export type LinePoint = { x: number; label: string; value: number };

export function LineChart({
  points,
  unit,
  height = 160,
  thresholds = [],
}: {
  points: LinePoint[];
  unit: string;
  height?: number;
  /**
   * Reference lines drawn behind the series — e.g. a meter's warn and
   * critical levels, so a reading is read against what it means.
   */
  thresholds?: { value: number; label: string; tone: "warn" | "critical" }[];
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const PAD = { top: 12, right: 12, bottom: 22, left: 44 };

  const { path, xs, ys, min, max, yOf } = useMemo(() => {
    if (points.length === 0) {
      return {
        path: "",
        xs: [] as number[],
        ys: [] as number[],
        min: 0,
        max: 1,
        yOf: () => 0,
      };
    }
    const values = points.map((p) => p.value);
    const scaleValues = [...values, ...thresholds.map((t) => t.value)];
    const lo = Math.min(...scaleValues);
    const hi = Math.max(...scaleValues);
    const span = hi - lo || 1;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const xs = points.map((_, i) =>
      points.length === 1
        ? PAD.left + innerW / 2
        : PAD.left + (i / (points.length - 1)) * innerW,
    );
    const ys = values.map(
      (v) => PAD.top + innerH - ((v - lo) / span) * innerH,
    );
    const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x},${ys[i]}`).join(" ");
    const yOf = (v: number) =>
      PAD.top + innerH - ((v - lo) / span) * innerH;
    return { path, xs, ys, min: lo, max: hi, yOf };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, thresholds]);

  if (points.length === 0) {
    return <p className="text-sm text-gray-400">No readings yet.</p>;
  }

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    xs.forEach((x, i) => {
      const d = Math.abs(x - px);
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    });
    setHover(best);
  }

  const h = hover != null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Trend, ${points.length} readings from ${points[0].label} to ${points[points.length - 1].label}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Threshold reference lines — labelled, so colour is never the
            only carrier of meaning. */}
        {thresholds.map((t) => {
          const y = yOf(t.value);
          const stroke = t.tone === "critical" ? "#dc2626" : "#d97706";
          return (
            <g key={`${t.label}-${t.value}`}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y}
                y2={y}
                stroke={stroke}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <text
                x={W - PAD.right}
                y={y - 4}
                textAnchor="end"
                fontSize={10}
                fill={stroke}
              >
                {t.label} {t.value}
              </text>
            </g>
          );
        })}
        {/* Recessive grid: min/max only */}
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top} y2={PAD.top} stroke="#e5e7eb" strokeWidth={1} />
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="#e5e7eb" strokeWidth={1} />
        <text x={PAD.left - 6} y={PAD.top + 4} textAnchor="end" fontSize={11} fill="#6b7280">
          {max}
        </text>
        <text x={PAD.left - 6} y={H - PAD.bottom + 4} textAnchor="end" fontSize={11} fill="#6b7280">
          {min}
        </text>
        <text x={PAD.left} y={H - 6} fontSize={11} fill="#6b7280">
          {points[0].label}
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize={11} fill="#6b7280">
          {points[points.length - 1].label}
        </text>
        <path d={path} fill="none" stroke={BAR_HUE} strokeWidth={2} strokeLinejoin="round" />
        {hover != null ? (
          <>
            <line
              x1={xs[hover]}
              x2={xs[hover]}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="#9ca3af"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle cx={xs[hover]} cy={ys[hover]} r={4.5} fill={BAR_HUE} stroke="#fff" strokeWidth={2} />
          </>
        ) : null}
      </svg>
      {h ? (
        <div className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs shadow-sm">
          <span className="font-semibold tabular-nums">
            {h.value} {unit}
          </span>{" "}
          <span className="text-gray-500">{h.label}</span>
        </div>
      ) : null}
    </div>
  );
}
