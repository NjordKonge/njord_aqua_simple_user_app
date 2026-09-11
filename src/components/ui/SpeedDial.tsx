import { useAnimatedValue } from "@/components/ui/AnimatedNumber";
import { cn } from "@/lib/utils";

/**
 * Speedometer-style dial: a 240° arc with tick marks, a needle, and the
 * reading in the centre.
 *
 * The 120° gap sits at the bottom, so the needle's rest position (min) is
 * bottom-left and full scale is bottom-right — the orientation people
 * already read from car dashboards, which is what makes the needle's
 * position interpretable before the number is read.
 *
 * Values outside [min, max] clamp the needle to the end of the scale but
 * still print the true figure, so an out-of-range reading is visible as
 * "pegged" rather than silently wrapping around.
 */
const SWEEP_DEG = 240;
const START_DEG = 150; // bottom-left; +240° lands bottom-right
const TICK_COUNT = 9; // 8 segments

export function SpeedDial({
  value,
  min = 0,
  max,
  unit,
  label,
  decimals = 0,
  size = 132,
  color = "var(--color-on-fill)",
  trackColor = "rgb(255 255 255 / 0.18)",
  textClassName = "text-on-fill",
  subTextClassName = "text-on-fill/55",
  placeholder,
}: {
  value: number | null;
  min?: number;
  max: number;
  unit: string;
  label: string;
  decimals?: number;
  size?: number;
  /** Arc + needle colour. */
  color?: string;
  trackColor?: string;
  textClassName?: string;
  subTextClassName?: string;
  /** Shown instead of the number when there is no reading (or it's idle). */
  placeholder?: string;
}) {
  const span = max - min || 1;
  const rawFrac = value === null ? 0 : (value - min) / span;
  const frac = Math.max(0, Math.min(1, rawFrac));

  // Animate the fraction, not the raw value, so the needle and the arc stay
  // locked together and a range change re-sweeps the needle coherently.
  const animatedFrac = useAnimatedValue(value === null ? null : frac, 420) ?? 0;
  const animatedValue = useAnimatedValue(value, 420);

  const cx = size / 2;
  const cy = size / 2;
  const stroke = Math.max(6, size * 0.065);
  const r = cx - stroke / 2 - size * 0.09;
  const circumference = 2 * Math.PI * r;
  const arcLen = (SWEEP_DEG / 360) * circumference;

  const needleAngle = START_DEG + animatedFrac * SWEEP_DEG;
  const needleRad = (needleAngle * Math.PI) / 180;
  const needleLen = r - stroke * 0.9;
  const nx = cx + Math.cos(needleRad) * needleLen;
  const ny = cy + Math.sin(needleRad) * needleLen;

  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const t = i / (TICK_COUNT - 1);
    const a = ((START_DEG + t * SWEEP_DEG) * Math.PI) / 180;
    const major = i % 2 === 0;
    const outer = r + stroke / 2 + size * 0.035;
    const inner = outer - (major ? size * 0.055 : size * 0.032);
    return {
      x1: cx + Math.cos(a) * inner,
      y1: cy + Math.sin(a) * inner,
      x2: cx + Math.cos(a) * outer,
      y2: cy + Math.sin(a) * outer,
      major,
    };
  });

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="block">
          {/* Ticks sit outside the arc so they read as a scale rather than
              as part of the value bar. */}
          <g>
            {ticks.map((t, i) => (
              <line
                key={i}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke={trackColor}
                strokeWidth={t.major ? 2 : 1}
                strokeLinecap="round"
              />
            ))}
          </g>

          {/* Track + value arc. Rotated so the dash, which starts at 3
              o'clock, begins at the bottom-left instead. */}
          <g transform={`rotate(${START_DEG} ${cx} ${cy})`}>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={trackColor}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${arcLen} ${circumference}`}
            />
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${arcLen * animatedFrac} ${circumference}`}
            />
          </g>

          {/* Needle. */}
          <line
            x1={cx}
            y1={cy}
            x2={nx}
            y2={ny}
            stroke={color}
            strokeWidth={Math.max(2, size * 0.018)}
            strokeLinecap="round"
          />
          <circle cx={cx} cy={cy} r={Math.max(3, size * 0.035)} fill={color} />
        </svg>

        {/* Reading, sitting in the dial's lower half where the arc gap is. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-[8%]">
          {value === null || placeholder ? (
            <span className={cn("text-sm font-medium", subTextClassName)}>
              {placeholder ?? "—"}
            </span>
          ) : (
            <span className={cn("flex items-baseline tnum", textClassName)}>
              <span className="type-value">{(animatedValue ?? 0).toFixed(decimals)}</span>
              <span className={cn("ml-0.5 type-unit", subTextClassName)}>{unit}</span>
            </span>
          )}
        </div>
      </div>

      <div className="mt-1 flex w-full items-center justify-between px-1">
        <span className={cn("type-label", subTextClassName)}>{min}</span>
        <span className={cn("type-cap", subTextClassName)}>{label}</span>
        <span className={cn("type-label", subTextClassName)}>{max}</span>
      </div>
    </div>
  );
}
