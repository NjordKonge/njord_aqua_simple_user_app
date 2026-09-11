import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/ui/useReducedMotion";

/**
 * Smoothly counts between readings instead of abruptly replacing the number.
 *
 * Live telemetry arrives as discrete BLE frames (~1 Hz); swapping "21.4" for
 * "22.9" in one frame reads as a glitch, whereas a short tween reads as a
 * measurement moving. Kept brief (260 ms default) so the displayed figure is
 * never meaningfully behind the device — this is a presentation smoothing
 * pass, not a data buffer.
 *
 * Honors `prefers-reduced-motion` by snapping straight to the target.
 */
export function useAnimatedValue(target: number | null, durationMs = 260): number | null {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState<number | null>(target);
  const fromRef = useRef<number | null>(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === null) {
      setDisplay(null);
      fromRef.current = null;
      return;
    }
    // No previous value (first real reading) or motion is disabled — show it
    // immediately rather than counting up from an arbitrary zero.
    if (reduced || fromRef.current === null) {
      setDisplay(target);
      fromRef.current = target;
      return;
    }

    const from = fromRef.current;
    if (from === target) return;

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic — fast to start, settles gently, no overshoot.
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from + (target - from) * eased;
      setDisplay(value);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      // Bank wherever the tween got to, so an interrupted animation
      // continues from the visible number rather than snapping backwards.
      fromRef.current = display ?? target;
    };
    // `display` is deliberately not a dependency — including it would
    // restart the tween on every animated frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs, reduced]);

  return display;
}

/**
 * A number that tweens between values, with the unit rendered at a smaller
 * weight/size beside it (the value/description size contrast that makes a
 * readout look considered rather than like raw text).
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  unit,
  placeholder = "—",
  className,
  unitClassName,
}: {
  value: number | null;
  decimals?: number;
  unit?: string;
  /** Shown when `value` is null (no reading yet / offline). */
  placeholder?: string;
  className?: string;
  unitClassName?: string;
}) {
  const animated = useAnimatedValue(value);

  if (animated === null) {
    return <span className={className}>{placeholder}</span>;
  }

  return (
    <span className={className}>
      <span className="tnum">{animated.toFixed(decimals)}</span>
      {unit ? <span className={unitClassName}>{unit}</span> : null}
    </span>
  );
}
