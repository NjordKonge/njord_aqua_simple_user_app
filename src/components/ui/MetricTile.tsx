import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Sparkline } from "@/components/ui/Sparkline";
import type { Tone } from "@/lib/device/status";

/** Tint for the small icon chip. Static lookups — Tailwind can't scan
 *  class names assembled from template literals. */
const CHIP_CLASS: Record<Tone, string> = {
  good: "bg-good/12 text-good",
  info: "bg-info/12 text-info",
  warn: "bg-warn/12 text-warn",
  bad: "bg-bad/12 text-bad",
};
const TREND_COLOR: Record<Tone, string> = {
  good: "var(--color-good)",
  info: "var(--color-info)",
  warn: "var(--color-warn)",
  bad: "var(--color-bad)",
};

/**
 * One reading, presented as: a small tinted icon chip, the value at display
 * weight, its unit at a deliberately lighter/smaller weight, and the
 * description smaller again beneath. That three-step size contrast is what
 * separates "a number in a box" from a readout that looks designed.
 *
 * Pass `trend` to add a sparkline showing where the value has been — useful
 * for anything sampled continuously, pointless for a static setting.
 */
export function MetricTile({
  icon: Icon,
  label,
  value,
  unit,
  decimals = 0,
  tone = "info",
  trend,
  /** Replaces the numeric readout entirely (e.g. "Waiting…", "N/A"). */
  placeholderText,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: number | null;
  unit?: string;
  decimals?: number;
  tone?: Tone;
  trend?: number[];
  placeholderText?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "surface-lift flex flex-col rounded-card border border-border-soft bg-surface p-3.5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.6rem]",
            CHIP_CLASS[tone],
          )}
        >
          <Icon size={15} strokeWidth={2.1} />
        </span>
        {trend && trend.length > 1 ? (
          <Sparkline data={trend} color={TREND_COLOR[tone]} width={44} height={18} />
        ) : null}
      </div>

      <div className="mt-2.5 flex items-baseline gap-1">
        {placeholderText ? (
          <span className="text-sm font-medium text-muted">{placeholderText}</span>
        ) : (
          <AnimatedNumber
            value={value}
            decimals={decimals}
            unit={unit}
            className="type-value text-content"
            unitClassName="ml-0.5 type-unit text-faint"
          />
        )}
      </div>

      <p className="mt-1 type-cap text-faint">{label}</p>
    </div>
  );
}
