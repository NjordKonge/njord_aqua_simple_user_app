import { useEffect, useState } from "react";

/**
 * Tracks the OS/browser "reduce motion" accessibility preference.
 *
 * styles.css already collapses *CSS* animations under this preference, but
 * JS-driven motion (the count-up in AnimatedNumber, the gauge arc sweep)
 * can't be reached by a stylesheet — it has to opt out explicitly, which is
 * what this hook is for. Anything animated in JS must consult it and jump
 * straight to the final value instead.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
