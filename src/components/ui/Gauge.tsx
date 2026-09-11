import type { ReactNode } from "react";
import { useAnimatedValue } from "@/components/ui/AnimatedNumber";
import type { Tone } from "@/lib/device/status";

const TONE_VAR: Record<Tone, string> = {
  good: "var(--color-good)",
  info: "var(--color-info)",
  warn: "var(--color-warn)",
  bad: "var(--color-bad)",
};

/**
 * Circular gauge for a value with a genuinely bounded range (tank level,
 * charge %, cycle progress) — deliberately NOT used for unbounded precise
 * readings like temperature or mA, where a plain number communicates better
 * than an arc the user has to estimate against.
 *
 * Drawn as a single 270° arc (a gap at the bottom, so it reads as a gauge
 * rather than a pie) with the track behind it. The arc length tweens via
 * stroke-dashoffset, and the value itself counts up in step, so a reading
 * change is one coherent movement.
 */
export function Gauge({
  percent,
  tone = "info",
  size = 132,
  strokeWidth = 9,
  children,
}: {
  /** 0–100, or null when there's no reading yet (renders an empty track). */
  percent: number | null;
  tone?: Tone;
  size?: number;
  strokeWidth?: number;
  /** Center content — typically the value + its label. */
  children?: ReactNode;
}) {
  const animated = useAnimatedValue(percent, 420);
  const shown = Math.max(0, Math.min(100, animated ?? 0));

  // 270° of sweep, rotated so the gap sits symmetrically at the bottom.
  const SWEEP = 0.75;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const arcLen = circumference * SWEEP;
  const filled = arcLen * (shown / 100);
  const color = TONE_VAR[tone];

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-[225deg]"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-surface-raised)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLen} ${circumference}`}
        />
        {percent !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}
