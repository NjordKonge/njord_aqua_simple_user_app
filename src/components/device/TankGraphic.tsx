import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/lib/ui/useReducedMotion";

const TANK_IMAGE_SRC = "/image (11).png";
// Intrinsic pixel size of the artwork (public/image (11).png) — a square
// product render, unlike the old transparent line-art. Every coordinate
// below is expressed in this canvas, and the SVG overlay shares the same
// viewBox, so the water/glow/bubbles line up with the drawn tank exactly.
const TANK_IMAGE_W = 1254;
const TANK_IMAGE_H = 1254;

// The artwork's own cut-away viewing window — the dark interior visible
// through the tank wall, where the probe rod hangs. Read off the artwork's
// pixels the same way the old silhouette was (per-row first/last "interior"
// pixel), this is the ONLY area the water fill, glow and bubbles are
// allowed to draw in; everywhere else is opaque white tank body that has to
// stay untouched, unlike the old fully-transparent line-art.
const TANK_CUTOFF_PATH = `
  M 600 245
  L 655 245
  L 813 400
  L 816 1030
  C 816 1085 745 1110 627 1110
  C 509 1110 438 1085 438 1030
  L 441 400
  Z
`;

// Waterline positions, in artwork coordinates: y for a full tank and y for
// an empty one. Full stops just below the narrow probe slit at the neck
// rather than filling it, so a 100% tank reads as a full viewing window,
// not a sliver poking up into the lid.
const WATER_FULL_Y = 300;
const WATER_EMPTY_Y = 1090;

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

// Drop-in probe anchor, in artwork coordinates — centre of the capsule at
// the bottom of the rod. Fixed rather than derived from `percent`: the
// probe's position on the artwork never moves, only the water around it
// does.
const PROBE_X = 627;
const PROBE_GLOW_Y = 985;
// Bubbles rise from just above the capsule up to just under the neck.
const BUBBLE_ORIGIN_Y = 950;
const BUBBLE_TRAVEL = BUBBLE_ORIGIN_Y - 380;
const BUBBLE_COUNT = 4;

/**
 * Tank artwork: the Njord tank product render (public/image (11).png) with
 * real water in its cut-away viewing window.
 *
 * Unlike the old transparent line-art, this artwork is an opaque render —
 * the tank body, the dark interior window and the probe are all baked into
 * one flat image. That means the water can no longer sit BEHIND the
 * artwork (it would just be hidden by the opaque window); instead it's
 * drawn ON TOP of the image, clipped to the window's own silhouette
 * (`TANK_CUTOFF_PATH`) and kept translucent so the rod and capsule still
 * read faintly through it, like something actually submerged.
 *
 * The surface is two copies of the same wave travelling at different speeds
 * in opposite directions. Their crests and troughs drift in and out of
 * phase, which gives the level a gentle swell without any single obviously
 * repeating shape — and because each copy translates by exactly one
 * wavelength, the loop is seamless.
 *
 * The probe itself no longer gets a flat colour tint when driven — that
 * read as a sticker over the artwork rather than something happening
 * inside the tank. Instead, a soft blurred glow sits behind/around the
 * capsule and a few small bubbles drift up from it, both kept low-contrast
 * on purpose so they stay a quiet "something is running" cue rather than
 * the first thing the eye catches.
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
   *  glows and bubbles the drop-in probe while true, matching the Home
   *  screen's Electrolysis LED. */
  electrolysisOn: boolean;
  /** Set false when the caller shows the level/volume figures itself, so
   *  the same numbers aren't printed twice under the artwork. */
  showCaption?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const clamped = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  // The card behind this artwork is dark (brand-deep) so the water needs its
  // own brighter tint: the ordinary --color-brand is too close in lightness
  // to brand-deep to read against it. --color-water-fill keeps a "water" hue
  // while giving real contrast; a low tank switches to the warn tone.
  const fillColor = low ? "var(--color-warn)" : "var(--color-water-fill)";
  const showWater = hasReading && clamped > 0;
  const waterY = WATER_FULL_Y + (1 - clamped / 100) * (WATER_EMPTY_Y - WATER_FULL_Y);

  // Generated once per mount, never per render: telemetry re-renders this
  // component every few seconds, and regenerating the parameters would
  // restart every bubble mid-flight and turn a calm drift into a stutter.
  const bubbles = useMemo(
    () =>
      Array.from({ length: BUBBLE_COUNT }, (_, i) => ({
        id: i,
        offsetX: (Math.random() - 0.5) * 26,
        drift: (Math.random() - 0.5) * 16,
        size: 5 + Math.random() * 4,
        delay: Math.random() * 4,
        duration: 3.2 + Math.random() * 1.8,
      })),
    [],
  );
  const showBubbles = electrolysisOn && !reducedMotion;

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
          {/* Tank render — the base layer. Always fully opaque; unlike the
              old line-art there's no "structure reads through" trick, this
              is the whole drawing. */}
          <img
            src={TANK_IMAGE_SRC}
            alt="Water tank"
            className="absolute inset-0 h-full w-full object-contain"
          />

          {/* WATER, GLOW & BUBBLES — all drawn on top of the render (since
              its viewing window is an opaque dark fill, not a transparent
              cut-out) and clipped to that window's own silhouette so
              nothing ever spills onto the white tank body around it. */}
          <svg
            aria-hidden
            viewBox={`0 0 ${TANK_IMAGE_W} ${TANK_IMAGE_H}`}
            className="absolute inset-0 h-full w-full"
          >
            <defs>
              <clipPath id="njord-tank-cutoff">
                <path d={TANK_CUTOFF_PATH} />
              </clipPath>
              <filter id="njord-probe-glow-blur" x="-150%" y="-150%" width="400%" height="400%">
                <feGaussianBlur stdDeviation="34" />
              </filter>
            </defs>
            <g clipPath="url(#njord-tank-cutoff)">
              <g
                className="transition-opacity duration-700"
                style={{ opacity: showWater ? 0.8 : 0 }}
              >
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

              {/* Soft glow behind/around the probe capsule — a blurred,
                  low-opacity blob rather than a flat tint, so it reads as
                  light coming from the electrode rather than a sticker on
                  top of it. `screen` blending only brightens the dark
                  window, it never flattens the capsule's own shading. */}
              <circle
                cx={PROBE_X}
                cy={PROBE_GLOW_Y}
                r={62}
                fill="var(--color-good)"
                filter="url(#njord-probe-glow-blur)"
                className={cn("transition-opacity duration-500", electrolysisOn && "animate-breathe")}
                style={{ opacity: electrolysisOn ? 0.5 : 0, mixBlendMode: "screen" }}
              />

              {/* A few small bubbles drifting up from the probe — background
                  texture only, kept dim by the wrapper's opacity ceiling so
                  they never outshine the glow or the water. */}
              {showBubbles ? (
                <g style={{ opacity: 0.4 }}>
                  {bubbles.map((b) => (
                    <circle
                      key={b.id}
                      className="animate-bubble"
                      cx={PROBE_X + b.offsetX}
                      cy={BUBBLE_ORIGIN_Y}
                      r={b.size}
                      fill="white"
                      style={{
                        animationDelay: `${b.delay}s`,
                        animationDuration: `${b.duration}s`,
                        ["--bubble-drift" as string]: `${b.drift}px`,
                        ["--bubble-travel" as string]: `${BUBBLE_TRAVEL}px`,
                      }}
                    />
                  ))}
                </g>
              ) : null}
            </g>
          </svg>
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
