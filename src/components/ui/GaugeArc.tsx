import { cn } from "@/lib/utils";

/**
 * Clean semi-circular percentage gauge — no needle, no tick marks — for the
 * Home "Live electrolysis status" card, per the facelift spec's "clean
 * semi-circular gauge with the percentage in the center".
 *
 * Deliberately a separate, simpler component rather than restyling
 * `SpeedDial` (which is a speedometer with a needle and tick scale, kept
 * for its more detailed/technical feel elsewhere): SpeedDial is left in
 * place unused rather than deleted, per this project's existing convention
 * of not removing superseded components.
 */
export function GaugeArc({
  percent,
  hasReading,
  label,
  placeholder,
  size = 120,
}: {
  percent: number;
  hasReading: boolean;
  label: string;
  /** Shown instead of the percentage when there is no reading (or it's idle). */
  placeholder?: string;
  size?: number;
}) {
  const stroke = Math.max(8, size * 0.12);
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference * (1 - clamped / 100);
  const height = size / 2 + stroke / 2;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height }}>
        <svg width={size} height={height} className="block overflow-visible">
          <path
            d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`}
            fill="none"
            stroke="rgb(255 255 255 / 0.14)"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          <path
            d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`}
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={hasReading ? offset : circumference}
            className="transition-[stroke-dashoffset] duration-700 ease-[var(--ease-out-soft)]"
          />
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center pb-0.5">
          {hasReading && !placeholder ? (
            <span className="type-value text-content">{Math.round(clamped)}%</span>
          ) : (
            <span className={cn("text-sm font-medium text-faint")}>{placeholder ?? "—"}</span>
          )}
        </div>
      </div>
      <p className="mt-1 type-cap text-faint">{label}</p>
    </div>
  );
}
