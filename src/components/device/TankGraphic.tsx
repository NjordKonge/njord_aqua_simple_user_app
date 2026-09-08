import { cn } from "@/lib/utils";

/**
 * Tank silhouette: domed top, cylindrical body, support legs. Blue fill
 * proportional to level, litre readout inside. Per spec.
 *
 * The fill is a live water surface rather than a flat rectangle: two wave
 * paths drift across the top at different speeds and opposite directions, so
 * the interference between them never visibly repeats. The body below the
 * surface is a vertical gradient (lighter at the surface, deepening toward
 * the base) which is what sells it as a volume of liquid instead of a
 * coloured bar. Everything is clipped to the tank silhouette, so the waves
 * are invisible when the tank is empty and never spill past the walls.
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
  const showWater = hasReading && clamped > 0;

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        {/* Ambient bloom behind the tank, tinted by fill state. Sits outside
            the SVG so it isn't subject to the silhouette clip. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-700"
          style={{
            opacity: showWater ? 1 : 0,
            background: `radial-gradient(52% 42% at 50% 68%, color-mix(in srgb, ${fillColor} 30%, transparent), transparent 72%)`,
          }}
        />
        <svg viewBox="0 0 140 200" className="h-44 w-32" aria-hidden>
          <defs>
            <clipPath id="tank-body-clip">
              {/* Domed top + cylindrical body */}
              <path d="M20 40 A50 30 0 0 1 120 40 L120 170 L20 170 Z" />
            </clipPath>

            {/* Depth gradient: brightest right at the surface, darkest at the
                base — reads as light penetrating from above. */}
            <linearGradient id="tank-water" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fillColor} stopOpacity="0.95" />
              <stop offset="55%" stopColor={fillColor} stopOpacity="0.8" />
              <stop
                offset="100%"
                stopColor="color-mix(in srgb, var(--color-brand-deep) 70%, black)"
                stopOpacity="0.9"
              />
            </linearGradient>

            {/* Interior vignette so the cylinder reads as round, not flat. */}
            <linearGradient id="tank-shade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#000" stopOpacity="0.34" />
              <stop offset="32%" stopColor="#000" stopOpacity="0" />
              <stop offset="72%" stopColor="#000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.28" />
            </linearGradient>
          </defs>

          {/* Tank outline */}
          <path
            d="M20 40 A50 30 0 0 1 120 40 L120 170 L20 170 Z"
            fill="var(--color-surface-muted)"
            stroke="var(--color-border)"
            strokeWidth="2"
          />

          <g clipPath="url(#tank-body-clip)">
            {/* Body of the water, from just under the wave crest downward. */}
            <rect
              x="20"
              y={fillTop}
              width="100"
              height={Math.max(0, bodyBottom - fillTop)}
              fill="url(#tank-water)"
              className="transition-all duration-700 ease-[var(--ease-out-soft)]"
            />

            {showWater ? (
              <g
                className="transition-transform duration-700 ease-[var(--ease-out-soft)]"
                style={{ transform: `translateY(${fillTop}px)` }}
              >
                {/* Back wave — slower, drifting the other way, semi-transparent
                    so the front wave crossing it creates moiré-free depth. */}
                <g className="animate-wave-slow">
                  <path
                    d="M-80 4 q 20 -5 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 L 240 40 L -80 40 Z"
                    fill={fillColor}
                    opacity="0.45"
                  />
                </g>
                {/* Front wave — the visible surface line. */}
                <g className="animate-wave">
                  <path
                    d="M-80 2 q 20 5 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 L 240 40 L -80 40 Z"
                    fill={fillColor}
                    opacity="0.9"
                  />
                  {/* Specular highlight riding the crest. */}
                  <path
                    d="M-80 2 q 20 5 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0"
                    fill="none"
                    stroke="#fff"
                    strokeOpacity="0.5"
                    strokeWidth="1.5"
                  />
                </g>
              </g>
            ) : null}

            {/* Cylinder shading over the water */}
            <rect x="20" y="10" width="100" height="160" fill="url(#tank-shade)" />
          </g>

          {/* Re-stroke the outline on top so the water never overlaps the wall */}
          <path
            d="M20 40 A50 30 0 0 1 120 40 L120 170 L20 170 Z"
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="2"
          />

          {/* Support legs */}
          <line x1="35" y1="170" x2="28" y2="192" stroke="var(--color-border)" strokeWidth="4" strokeLinecap="round" />
          <line x1="105" y1="170" x2="112" y2="192" stroke="var(--color-border)" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>

      <p className={cn("tnum mt-2 text-sm font-semibold", low ? "text-warn" : "text-content")}>
        {hasReading && liters !== null
          ? `${Math.round(liters)}L of ${capacityLiters}L`
          : "Level unknown"}
      </p>
    </div>
  );
}
