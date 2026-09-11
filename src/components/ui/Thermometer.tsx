import { useAnimatedValue } from "@/components/ui/AnimatedNumber";
import { cn } from "@/lib/utils";

/**
 * Classic thermometer: a vertical tube with a bulb at the bottom that fills
 * as the reading rises, with the figure alongside it.
 *
 * Deliberately mirrors SpeedDial's props so the two can be swapped without
 * touching the caller, and so a screen can mix them freely — a dial suits an
 * abstract magnitude like power, whereas temperature has an obvious physical
 * analogue that people read faster than a needle.
 *
 * Values outside [min, max] clamp the column to the end of the tube but
 * still print the true figure, so an out-of-range reading shows as "pegged"
 * rather than silently overflowing.
 */

// Geometry, in px, laid out against a box `size` tall. The tube occupies the
// left edge; the reading sits to its right, which is where the tall, narrow
// shape leaves room. Sized generously rather than to scale: a hairline tube
// is technically more thermometer-like but reads as visually weightless
// beside a dial of the same height.
const TUBE_W = 21;
const BULB_R = 17;
const TUBE_CX = 23;
const TUBE_TOP = 7;

// How many scale marks run alongside the tube (min, quarters, max).
const TICK_COUNT = 5;

export function Thermometer({
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
  /** Liquid colour. */
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

  // Animate the fraction rather than the raw value, so the column and the
  // number stay locked together and changing the range re-fills coherently.
  const animatedFrac = useAnimatedValue(value === null ? null : frac, 420) ?? 0;
  const animatedValue = useAnimatedValue(value, 420);

  const bulbCy = size - BULB_R - 2;
  // The column's travel: `empty` sits just inside the top of the bulb so the
  // bulb always reads as full (as a real thermometer's does, since the
  // liquid never leaves it), and `full` stops short of the tube's rounded
  // cap so a maxed-out reading still looks like liquid in a tube.
  const emptyY = bulbCy - BULB_R + 5;
  const fullY = TUBE_TOP + 6;
  const fillTopY = emptyY - animatedFrac * (emptyY - fullY);

  const innerW = TUBE_W - 8;

  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const t = i / (TICK_COUNT - 1);
    const major = i === 0 || i === TICK_COUNT - 1 || i === (TICK_COUNT - 1) / 2;
    return {
      y: emptyY - t * (emptyY - fullY),
      len: major ? 7 : 4,
    };
  });

  const tickX = TUBE_CX + TUBE_W / 2 + 3;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="block">
          {/* Track and liquid are both drawn as plain fills (tube + bulb),
              with no stroke: the two shapes overlap, and outlining them
              would leave a seam line across the join. */}
          <rect
            x={TUBE_CX - TUBE_W / 2}
            y={TUBE_TOP}
            width={TUBE_W}
            height={bulbCy - TUBE_TOP}
            rx={TUBE_W / 2}
            fill={trackColor}
          />
          <circle cx={TUBE_CX} cy={bulbCy} r={BULB_R} fill={trackColor} />

          {/* Liquid: the bulb is always full, the column rises out of it. */}
          <circle cx={TUBE_CX} cy={bulbCy} r={BULB_R - 4} fill={color} />
          <rect
            x={TUBE_CX - innerW / 2}
            y={fillTopY}
            width={innerW}
            height={Math.max(0, bulbCy - fillTopY)}
            rx={innerW / 2}
            fill={color}
          />

          {/* Scale marks down the side of the tube. */}
          <g>
            {ticks.map((t, i) => (
              <line
                key={i}
                x1={tickX}
                y1={t.y}
                x2={tickX + t.len}
                y2={t.y}
                stroke={trackColor}
                strokeWidth={i === 0 || i === TICK_COUNT - 1 ? 2 : 1}
                strokeLinecap="round"
              />
            ))}
          </g>
        </svg>

        {/* Reading, beside the tube rather than under it — the tall narrow
            shape leaves the right-hand side of the box empty. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex w-[50%] flex-col justify-center">
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
