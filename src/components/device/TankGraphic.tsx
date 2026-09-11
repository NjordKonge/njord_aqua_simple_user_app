import { cn } from "@/lib/utils";

const TANK_IMAGE_SRC = "/Njord_icon_app.png";
// Intrinsic pixel size of the artwork (public/Njord_icon_app.png). Used to
// lock an inner box to the SAME aspect ratio the image itself renders at
// (see the `aspectRatio` box below) so the clip-paths further down — which
// are expressed as fixed percentages of the artwork's own canvas — stay
// pixel-accurate no matter what shape the outer container is, instead of
// drifting whenever object-contain/mask-size:contain letterboxes the art.
const TANK_IMAGE_W = 684;
const TANK_IMAGE_H = 512;
// Fixed bounding box (as % of the artwork canvas) of just the drop-in
// probe/electrode capsule hanging inside the tank — NOT the water level,
// which is why this is a constant rather than derived from `percent`.
// Measured directly off the PNG (see conversation history for the pixel
// scan); kept generous by a few px on each side.
const PROBE_CLIP = "inset(41% 46% 39% 46%)";

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
  electrolysisOn,
  showCaption = true,
}: {
  /** 0-100, or null when no sonar reading has been taken this session. */
  percent: number | null;
  liters: number | null;
  capacityLiters: number;
  low: boolean;
  hasReading: boolean;
  /** Live "is the electrode actively driven right now" flag (elec_on) —
   *  pulses the drop-in probe green while true, matching the Home screen's
   *  Electrolysis LED. */
  electrolysisOn: boolean;
  /** Set false when the caller shows the level/volume figures itself, so
   *  the same numbers aren't printed twice under the artwork. */
  showCaption?: boolean;
}) {
  const clamped = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  // The card behind this artwork is dark (brand-deep, #0f4c68 — see
  // index.tsx) so the water fill needs its own brighter tint: the ordinary
  // --color-brand is too close in lightness to brand-deep to read clearly
  // against it (contrast ratio ~1.4:1). This lighter sky-blue keeps a
  // "water" hue while giving a real ~3.9:1 contrast against the backdrop.
  const fillColor = low ? "var(--color-warn)" : "#4fb3d9";
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
    <div className="flex h-full w-full flex-col items-center">
      <div className="relative w-full min-h-0 flex-1">
        {/* Locked to the artwork's own aspect ratio and centered — mirrors
            exactly how object-contain/mask-size:contain place the image
            within a differently-shaped outer box, so every clip-path below
            (expressed as % of the artwork canvas) lines up with the real
            silhouette instead of drifting with letterbox/pillarbox gaps. */}
        <div
          className="absolute inset-0 m-auto"
          style={{ aspectRatio: `${TANK_IMAGE_W} / ${TANK_IMAGE_H}`, maxWidth: "100%", maxHeight: "100%" }}
        >
          {/* Base artwork, dimmed — the "empty" read, always visible. */}
          <img
            src={TANK_IMAGE_SRC}
            alt="Water tank"
            className="absolute inset-0 h-full w-full object-contain transition-opacity duration-700"
            style={{ opacity: showWater ? 0.35 : 0.6, filter: "grayscale(1) brightness(1.3)" }}
          />

          {/* Coloured fill: same artwork, masked to its own ink, clipped from
              the top so only the bottom `clamped`% is revealed. The clip
              transition is the only "water motion" — brief and tied to an
              actual level update, not a looping effect. */}
          <div
            aria-hidden
            className="absolute inset-0 overflow-hidden transition-[clip-path] duration-700 ease-[var(--ease-out-soft)]"
            style={{ clipPath: `inset(${clipInset})`, WebkitClipPath: `inset(${clipInset})` }}
          >
            <div
              className="relative h-full w-full transition-opacity duration-700"
              style={{ opacity: showWater ? 1 : 0, ...maskStyle }}
            >
              <div className="absolute inset-0" style={{ backgroundColor: fillColor }} />
            </div>
          </div>

          {/* Drop-in electrolysis probe: same artwork masked to its own ink
              again, but clipped to a FIXED box around just the probe capsule
              (not the water level) — tinted green while the electrode is
              actively being driven right now. A gentle opacity heartbeat
              (no glow, no scale) marks it as live rather than a static tint. */}
          <div
            aria-hidden
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: PROBE_CLIP, WebkitClipPath: PROBE_CLIP }}
          >
            <div
              className={cn(
                "absolute inset-0 transition-opacity duration-500",
                electrolysisOn && "animate-breathe",
              )}
              style={{ opacity: electrolysisOn ? 1 : 0, ...maskStyle }}
            >
              <div className="absolute inset-0" style={{ backgroundColor: "var(--color-good)" }} />
            </div>
          </div>
        </div>
      </div>

      {showCaption ? (
        <p className={cn("tnum mt-2 shrink-0 text-sm font-medium", low ? "text-warn" : "text-on-fill")}>
          {hasReading && liters !== null
            ? `${Math.round(liters)}L of ${capacityLiters}L`
            : "Level unknown"}
        </p>
      ) : null}
    </div>
  );
}

