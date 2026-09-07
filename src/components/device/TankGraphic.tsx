import { cn } from "@/lib/utils";

/**
 * Tank silhouette: domed top, cylindrical body, support legs. Blue fill
 * proportional to level, litre readout inside. Per spec.
 */
export function TankGraphic({
  percent,
  liters,
  capacityLiters,
  low,
  hasReading,
}: {
  /** 0-100, or null when no sonar reading has been taken this session. */
  percent: number | null;
  liters: number | null;
  capacityLiters: number;
  low: boolean;
  hasReading: boolean;
}) {
  const clamped = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  // Fill rect grows from the bottom of the cylindrical body (y=40..170).
  const bodyTop = 40;
  const bodyBottom = 170;
  const fillTop = bodyBottom - (clamped / 100) * (bodyBottom - bodyTop);
  const fillColor = low ? "var(--color-warn)" : "var(--color-brand)";

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 140 200" className="h-44 w-32" aria-hidden>
        <defs>
          <clipPath id="tank-body-clip">
            {/* Domed top + cylindrical body */}
            <path d="M20 40 A50 30 0 0 1 120 40 L120 170 L20 170 Z" />
          </clipPath>
        </defs>

        {/* Tank outline */}
        <path
          d="M20 40 A50 30 0 0 1 120 40 L120 170 L20 170 Z"
          fill="var(--color-surface-muted)"
          stroke="var(--color-border)"
          strokeWidth="2"
        />

        {/* Water fill, clipped to the tank silhouette */}
        <rect
          x="20"
          y={fillTop}
          width="100"
          height={Math.max(0, bodyBottom - fillTop)}
          fill={fillColor}
          clipPath="url(#tank-body-clip)"
          className="transition-all duration-500"
        />

        {/* Support legs */}
        <line x1="35" y1="170" x2="28" y2="192" stroke="var(--color-border)" strokeWidth="4" strokeLinecap="round" />
        <line x1="105" y1="170" x2="112" y2="192" stroke="var(--color-border)" strokeWidth="4" strokeLinecap="round" />
      </svg>

      <p className={cn("mt-2 text-sm font-medium", low ? "text-warn" : "text-content")}>
        {hasReading && liters !== null
          ? `${Math.round(liters)}L of ${capacityLiters}L`
          : "Level unknown"}
      </p>
    </div>
  );
}
