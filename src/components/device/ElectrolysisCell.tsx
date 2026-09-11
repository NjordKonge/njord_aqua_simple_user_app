import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/lib/ui/useReducedMotion";

/**
 * Live electrolysis cell: two square electrode plates in water, with gas
 * bubbles evolving off them while current is actually flowing.
 *
 * This is the one place in the app that shows the process itself rather than
 * a number about it — "is it working right now?" is answerable from across
 * the room. The bubbles are the state: they exist only while `active` is
 * true, so a still cell unambiguously means nothing is being produced.
 *
 * Bubble timing is randomised once per mount (not per render) so the stream
 * looks like gas evolution rather than a marching pattern, and stays stable
 * across the frequent re-renders driven by live telemetry.
 */
const BUBBLE_COUNT = 14;

export function ElectrolysisCell({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();

  const bubbles = useMemo(
    () =>
      Array.from({ length: BUBBLE_COUNT }, (_, i) => {
        // Split the stream between the two plates' inner faces, which is
        // where gas actually comes off.
        const leftPlate = i % 2 === 0;
        const base = leftPlate ? 30 : 62;
        return {
          id: i,
          left: base + Math.random() * 8,
          size: 3 + Math.random() * 5,
          delay: Math.random() * 2.8,
          duration: 2.2 + Math.random() * 1.8,
          drift: (leftPlate ? 1 : -1) * (2 + Math.random() * 6),
        };
      }),
    [],
  );

  return (
    <div
      className={cn(
        "relative h-28 w-full overflow-hidden rounded-inner",
        // The cell interior is a touch darker than the panel so the water
        // body reads as contained rather than as panel background.
        "bg-brand-deep/45",
        className,
      )}
    >
      {/* Electrodes: two square plates, face to face. They brighten when
          driven, which alone distinguishes on from off even with motion
          disabled. */}
      <Plate side="left" active={active} />
      <Plate side="right" active={active} />

      {/* Connecting bus bars across the top, so the plates read as wired
          rather than as two floating squares. */}
      <span
        aria-hidden
        className={cn(
          "absolute left-[28%] right-[28%] top-3 h-px transition-colors duration-500",
          active ? "bg-white/45" : "bg-white/15",
        )}
      />

      {active && !reduced ? (
        <div aria-hidden className="absolute inset-0">
          {bubbles.map((b) => (
            <span
              key={b.id}
              className="absolute bottom-3 rounded-full bg-white/70 animate-bubble"
              style={{
                left: `${b.left}%`,
                width: b.size,
                height: b.size,
                animationDelay: `${b.delay}s`,
                animationDuration: `${b.duration}s`,
                ["--bubble-drift" as string]: `${b.drift}px`,
              }}
            />
          ))}
        </div>
      ) : null}

      {/* Waterline, to place the plates in liquid. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-2 h-px bg-white/20"
      />
    </div>
  );
}

function Plate({ side, active }: { side: "left" | "right"; active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute top-1/2 h-14 w-14 -translate-y-1/2 rounded-[0.35rem] border transition-colors duration-500",
        side === "left" ? "left-[18%]" : "right-[18%]",
        active
          ? "border-white/55 bg-white/20"
          : "border-white/20 bg-white/[0.06]",
      )}
    >
      {/* Lead going up to the bus bar. */}
      <span
        className={cn(
          "absolute -top-5 left-1/2 h-5 w-px -translate-x-1/2 transition-colors duration-500",
          active ? "bg-white/45" : "bg-white/15",
        )}
      />
    </span>
  );
}
