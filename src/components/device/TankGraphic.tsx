import { cn } from "@/lib/utils";

const TANK_IMAGE_SRC = "/Njord_icon_app.png";
// Intrinsic pixel size of the artwork (public/Njord_icon_app.png). Every
// coordinate below is expressed in this canvas, and the SVG overlay shares
// the same viewBox, so the water lines up with the drawn tank exactly.
const TANK_IMAGE_W = 684;
const TANK_IMAGE_H = 512;

// Silhouette of the barrel's interior. Rather than eyeballing this, the
// coordinates were read off the artwork's own alpha channel (per-row first
// and last inked pixel): the body has dead-straight sides at x=56 and x=627
// running from the base of the domed top down to y=424, where the bottom
// ellipse (centre y=424, rx≈285, ry≈72) takes over. The two cubics below are
// quarter-ellipse approximations of that bottom, so the water settles into
// the curve of the tank floor instead of sitting on a flat line.
const TANK_BODY_PATH = `
  M 56 132
  L 56 424
  C 56 464 184 496 341.5 496
  C 499 496 627 464 627 424
  L 627 132
  Z
`;

// Waterline positions, in artwork coordinates: y for a full tank and y for
// an empty one. Full stops just below the top rim rather than at it, so a
// 100% tank still reads as a tank with water in it, not a solid block.
const WATER_FULL_Y = 140;
const WATER_EMPTY_Y = 496;

// One wavelength of the surface wave. The wave path repeats at exactly this
// interval and the keyframe translates by exactly this much, so the loop has
// no visible seam. (Kept in sync with `wave-shift` in styles.css.)
const WAVE_LEN = 342;
const WAVE_AMP = 9;
const HALF = WAVE_LEN / 2;
const QUARTER = WAVE_LEN / 4;

/** One full sine-ish cycle as two quadratic arcs: crest then trough. */
const CYCLE = `q ${QUARTER} ${-WAVE_AMP} ${HALF} 0 q ${QUARTER} ${WAVE_AMP} ${HALF} 0 `;
// Five wavelengths, starting one wavelength to the left of the canvas, so
// the shape still covers the full width at either end of its travel.
const WAVE_PATH = `M ${-WAVE_LEN} 0 ${CYCLE.repeat(5)} L ${WAVE_LEN * 4} 620 L ${-WAVE_LEN} 620 Z`;

// Fixed bounding box (as % of the artwork canvas) of just the drop-in
// probe/electrode capsule hanging inside the tank — NOT the water level,
// which is why this is a constant rather than derived from `percent`.
const PROBE_CLIP = "inset(41% 46% 39% 46%)";

/**
 * Tank artwork: the actual Njord tank render (public/Njord_icon_app.png)
 * with real water in it.
 *
 * The artwork is white line-art on transparent, so the water is drawn as a
 * filled shape BEHIND it, clipped to the barrel's interior silhouette. That
 * fills the body of the tank rather than just tinting its outlines, and the
 * line-art then sits on top and reads as the tank's structure seen through
 * the water.
 *
 * The surface is two copies of the same wave travelling at different speeds
 * in opposite directions. Their crests and troughs drift in and out of
 * phase, which gives the level a gentle swell without any single obviously
 * repeating shape — and because each copy translates by exactly one
 * wavelength, the loop is seamless.
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
  // The card behind this artwork is dark (brand-deep) so the water needs its
  // own brighter tint: the ordinary --color-brand is too close in lightness
  // to brand-deep to read against it. --color-water-fill keeps a "water" hue
  // while giving real contrast; a low tank switches to the warn tone.
  const fillColor = low ? "var(--color-warn)" : "var(--color-water-fill)";
  const showWater = hasReading && clamped > 0;
  const waterY = WATER_FULL_Y + (1 - clamped / 100) * (WATER_EMPTY_Y - WATER_FULL_Y);

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
            exactly how object-contain places the image within a
            differently-shaped outer box, so the SVG overlay (which shares
            the artwork's viewBox) stays registered with the drawing instead
            of drifting with letterbox/pillarbox gaps. */}
        <div
          className="absolute inset-0 m-auto"
          style={{ aspectRatio: `${TANK_IMAGE_W} / ${TANK_IMAGE_H}`, maxWidth: "100%", maxHeight: "100%" }}
        >
          {/* WATER — behind the line-art, clipped to the barrel interior. */}
          <svg
            aria-hidden
            viewBox={`0 0 ${TANK_IMAGE_W} ${TANK_IMAGE_H}`}
            className="absolute inset-0 h-full w-full transition-opacity duration-700"
            style={{ opacity: showWater ? 1 : 0 }}
          >
            <defs>
              <clipPath id="njord-tank-body">
                <path d={TANK_BODY_PATH} />
              </clipPath>
            </defs>
            <g clipPath="url(#njord-tank-body)">
              {/* Outer group carries the level; the inner groups carry the
                  wave travel, so the two transforms don't fight over the
                  same property. */}
              <g
                style={{
                  transform: `translateY(${waterY}px)`,
                  transition: "transform 700ms var(--ease-out-soft)",
                }}
              >
                <g className="animate-wave-back">
                  <path d={WAVE_PATH} fill={fillColor} opacity={0.45} transform="translate(-85 -6)" />
                </g>
                <g className="animate-wave-front">
                  <path d={WAVE_PATH} fill={fillColor} />
                </g>
              </g>
            </g>
          </svg>

          {/* Line-art, on top of the water so the tank's structure reads
              through it. */}
          <img
            src={TANK_IMAGE_SRC}
            alt="Water tank"
            className="absolute inset-0 h-full w-full object-contain transition-opacity duration-700"
            style={{ opacity: showWater ? 0.85 : 0.6 }}
          />

          {/* Drop-in electrolysis probe: the same artwork masked to its own
              ink, clipped to a FIXED box around just the probe capsule (not
              the water level) — tinted green while the electrode is actively
              being driven right now. A gentle opacity heartbeat (no glow, no
              scale) marks it as live rather than a static tint. */}
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
