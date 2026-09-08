import { cn } from "@/lib/utils";

const TANK_IMAGE_SRC = "/Njord_icon_app.png";
// Natural pixel dimensions of the artwork (see public/Njord_icon_app.png) —
// locks the aspect ratio so the dimmed base copy and the coloured fill copy
// below never drift apart from each other.
const TANK_IMAGE_ASPECT = 2099 / 1576;

/**
 * Tank artwork: the actual Njord tank render (public/Njord_icon_app.png),
 * used as a liquid-fill icon rather than a hand-drawn silhouette.
 *
 * The trick is the same one battery/thermometer "fill" icons use: the SAME
 * transparent PNG is drawn twice, stacked exactly on top of itself —
 *   1. a dimmed grayscale copy underneath, always fully visible (the "empty"
 *      read), and
 *   2. a copy on top that is CSS-masked to its own ink (so only the
 *      artwork's lines/panels pick up colour, never the transparent
 *      background), tinted with the fill colour, and clipped from the top so
 *      only the bottom `percent`% of it shows.
 * Because both copies are pixel-identical, the coloured "waterline" always
 * lines up perfectly with the real artwork no matter how intricate its
 * silhouette is — no manual path-tracing required. A soft shimmer sweeps
 * across the fill (masked the same way) so it doesn't read as a static tint.
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
  const fillColor = low ? "var(--color-warn)" : "var(--color-brand)";
  const showWater = hasReading && clamped > 0;
  // Reveal the bottom `clamped`% by clipping away the top (100 - clamped)%.
  const clipInset = `${100 - clamped}% 0 0 0`;
  const maskStyle = {
    WebkitMaskImage: `url(${TANK_IMAGE_SRC})`,
    maskImage: `url(${TANK_IMAGE_SRC})`,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  } as const;

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative w-full max-w-[210px]"
        style={{ aspectRatio: TANK_IMAGE_ASPECT }}
      >
        {/* Ambient bloom behind the tank, tinted by fill state. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-700"
          style={{
            opacity: showWater ? 1 : 0,
            background: `radial-gradient(55% 55% at 50% 65%, color-mix(in srgb, ${fillColor} 30%, transparent), transparent 72%)`,
          }}
        />

        {/* Base artwork, dimmed — the "empty" read, always visible. */}
        <img
          src={TANK_IMAGE_SRC}
          alt="Water tank"
          className="absolute inset-0 h-full w-full object-contain transition-opacity duration-700"
          style={{ opacity: showWater ? 0.4 : 0.75, filter: "grayscale(1) brightness(1.6)" }}
        />

        {/* Coloured fill: same artwork, masked to its own ink, clipped from
            the top so only the bottom `clamped`% is revealed. */}
        <div
          aria-hidden
          className="absolute inset-0 overflow-hidden transition-[clip-path] duration-700 ease-[var(--ease-out-soft)]"
          style={{ clipPath: `inset(${clipInset})`, WebkitClipPath: `inset(${clipInset})` }}
        >
          <div
            className="relative h-full w-full transition-opacity duration-700"
            style={{ opacity: showWater ? 1 : 0, ...maskStyle }}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${fillColor} 90%, white), ${fillColor} 45%, color-mix(in srgb, var(--color-brand-deep) 80%, black))`,
                filter: `drop-shadow(0 0 10px color-mix(in srgb, ${fillColor} 55%, transparent))`,
              }}
            />
            {/* Light sweeping across the fill so it reads as liquid, not a
                flat tint. */}
            <div
              className="absolute inset-0 w-[60%] animate-shimmer"
              style={{
                backgroundImage:
                  "linear-gradient(115deg, transparent 30%, rgb(255 255 255 / 0.45) 50%, transparent 70%)",
              }}
            />
          </div>
        </div>
      </div>

      <p className={cn("tnum mt-2 text-sm font-semibold", low ? "text-warn" : "text-content")}>
        {hasReading && liters !== null
          ? `${Math.round(liters)}L of ${capacityLiters}L`
          : "Level unknown"}
      </p>
    </div>
  );
}

