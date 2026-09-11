import { useMemo } from "react";
import { useReducedMotion } from "@/lib/ui/useReducedMotion";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/device/status";

/**
 * "Live electrolysis status" — the electrode's current drive state, shown as
 * a large readout on its own recessed panel.
 *
 * An earlier version drew two animated electrodes with bubbles streaming off
 * them. It was the most eye-catching thing on the screen while being the
 * least informative, and it competed with the words that actually carry the
 * meaning. The illustration is gone; what's left is the status itself, set
 * large, on a darker inset so it separates from the panel behind it.
 *
 * Bubbles survive only as ambient background texture: slow, small, and very
 * low contrast, present purely as a passive "something is happening in
 * there" cue while current is flowing. They must never compete with the
 * label — hence the opacity ceiling on the whole layer (see below).
 */

// Few, and slow. A dense fast stream would be exactly the distraction this
// rewrite set out to remove.
const BUBBLE_COUNT = 7;

// Height of the readout panel, in px, and therefore how far a bubble has to
// travel to cross it. Fixed rather than measured: it feeds a CSS custom
// property consumed by the `bubble-rise` keyframe, which needs a real length
// (a percentage would resolve against the bubble's own 4px box).
const PANEL_H = 92;

/**
 * Bright dot colours. The app's status tokens are tuned for white cards and
 * go muddy on this dark blue, so the dots use lighter variants — while the
 * label itself stays plain white, so the status never depends on colour
 * alone to be read.
 * Static lookup: never build Tailwind class names from template literals.
 */
const TONE_DOT: Record<Tone, string> = {
  good: "bg-[#57e39b]",
  info: "bg-[#6fd2f0]",
  warn: "bg-[#ffc861]",
  bad: "bg-[#ff8f88]",
};

export function ElectrolysisStatusPanel({
  tone,
  label,
  active,
  className,
}: {
  tone: Tone;
  label: string;
  /** Current is actually flowing — the only state that gets bubbles. */
  active: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();

  // Generated once per mount, never per render: telemetry re-renders this
  // component every few seconds, and regenerating the parameters would
  // restart every bubble mid-flight and turn a calm drift into a stutter.
  const bubbles = useMemo(
    () =>
      Array.from({ length: BUBBLE_COUNT }, (_, i) => ({
        id: i,
        // Spread across the width with a little jitter, so they don't form
        // a visible grid.
        left: 6 + (i * 88) / BUBBLE_COUNT + Math.random() * 6,
        size: 3 + Math.random() * 3,
        delay: Math.random() * 7,
        duration: 6 + Math.random() * 4,
        drift: (Math.random() - 0.5) * 10,
      })),
    [],
  );

  const showBubbles = active && !reduced;

  return (
    <div
      className={cn(
        "relative flex flex-col justify-center overflow-hidden rounded-inner",
        "border border-white/10 bg-brand-deep/55 px-4",
        className,
      )}
      style={{ height: PANEL_H }}
    >
      {showBubbles ? (
        // The opacity ceiling lives on this wrapper rather than in the
        // keyframe, so the bubbles can fade in and out on their own curve
        // while still never rising above ~18% against the panel.
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.18]">
          {bubbles.map((b) => (
            <span
              key={b.id}
              className="animate-bubble absolute bottom-0 rounded-full bg-white"
              style={{
                left: `${b.left}%`,
                width: b.size,
                height: b.size,
                animationDelay: `${b.delay}s`,
                animationDuration: `${b.duration}s`,
                ["--bubble-drift" as string]: `${b.drift}px`,
                ["--bubble-travel" as string]: `${PANEL_H}px`,
              }}
            />
          ))}
        </div>
      ) : null}

      <p className="relative type-cap text-on-fill/55">Live electrolysis status</p>
      <div className="relative mt-1.5 flex items-center gap-2.5">
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            TONE_DOT[tone],
            // Only a genuinely-running electrode pulses; the other states
            // stay still, so the motion keeps meaning "right now".
            active && "animate-breathe",
          )}
        />
        <span className="type-value text-on-fill">{label}</span>
      </div>
    </div>
  );
}
