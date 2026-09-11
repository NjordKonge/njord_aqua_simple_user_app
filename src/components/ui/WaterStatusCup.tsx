import { useReducedMotion } from "@/lib/ui/useReducedMotion";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/device/status";

/**
 * Simple cup/tumbler icon, filled to tone colour, with a couple of small
 * droplets splashing above the rim. Deliberately plain geometry (a
 * trapezoid glass, a flat-ish wavy waterline) rather than anything
 * photorealistic — this is a status icon that has to read correctly at a
 * glance, not an illustration.
 *
 * The droplets are plain HTML spans layered over the SVG glass, not SVG
 * shapes animated via CSS transform: an SVG child's `transform: translateXpx`
 * doesn't reliably map 1:1 to the viewBox's user units once the element is
 * scaled to a rendered size smaller than its viewBox (as this one is), so a
 * translate calibrated in px can drift or clip unpredictably. Plain
 * absolutely-positioned HTML elements (the same technique already used for
 * ElectrolysisStatusPanel's bubbles) don't have that problem.
 *
 * The splash is ambient branding, not a state signal: it plays in every
 * tone, including the neutral "unknown" one, so its presence never implies
 * anything about safety on its own — only the colour and the words next to
 * it do that.
 */

/** Static lookup — never build Tailwind/CSS colour values from a template
 *  literal built out of `tone`. */
const TONE_COLOR: Record<Tone, string> = {
  good: "var(--color-good)",
  info: "var(--color-faint)",
  warn: "var(--color-warn)",
  bad: "var(--color-bad)",
};

const DROPLETS = [
  { left: 30, delay: 0 },
  { left: 50, delay: 0.7 },
  { left: 68, delay: 1.4 },
];

export function WaterStatusCup({
  tone,
  size = 56,
  className,
}: {
  tone: Tone;
  size?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const color = TONE_COLOR[tone];

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-hidden>
        {/* Water fill: a flat top with a gentle wavy edge, drawn once
            (unanimated) rather than trying to make a moving surface work at
            this small a scale — "simple cup", not a tank. */}
        <path
          d="M 20 26 Q 26 22 32 26 Q 38 30 44 26 L 44 56 Q 44 60 32 60 Q 20 60 20 56 Z"
          fill={color}
          opacity={0.9}
        />
        {/* Glass outline, on top of the fill so the rim and base read
            clearly against it. */}
        <path
          d="M 15 14 L 49 14 L 44 56 Q 44 60 32 60 Q 20 60 20 56 Z"
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinejoin="round"
          opacity={0.4}
        />
      </svg>

      {/* Splash droplets bouncing above the rim. */}
      {!reduced ? (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {DROPLETS.map((d) => (
            <span
              key={d.left}
              className="animate-splash absolute rounded-full"
              style={{
                left: `${d.left}%`,
                top: "18%",
                width: size * 0.07,
                height: size * 0.07,
                backgroundColor: color,
                animationDelay: `${d.delay}s`,
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
