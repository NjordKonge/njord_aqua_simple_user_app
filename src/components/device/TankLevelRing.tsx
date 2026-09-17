/**
 * Circular tank-level gauge for the Home "Tank status" card — a ring fill
 * plus a large centred percentage, per the facelift's "circular progress
 * indicator and a large percentage" spec.
 *
 * Replaces the old tank illustration (`TankGraphic`) on Home; that component
 * is left in place unused rather than deleted, per this project's existing
 * convention of not removing superseded assets/components. Pure SVG, no
 * new dependency.
 */
export function TankLevelRing({
  percent,
  hasReading,
  low,
  size = 120,
}: {
  percent: number;
  hasReading: boolean;
  low?: boolean;
  size?: number;
}) {
  const stroke = Math.max(10, size * 0.14);
  const radius = size / 2 - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference * (1 - clamped / 100);
  const color = low ? "var(--color-warn)" : "var(--color-brand)";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(255 255 255 / 0.20)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={hasReading ? offset : circumference}
          className="transition-[stroke-dashoffset] duration-700 ease-[var(--ease-out-soft)]"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="type-value text-content">{hasReading ? `${Math.round(clamped)}%` : "—"}</span>
      </div>
    </div>
  );
}
