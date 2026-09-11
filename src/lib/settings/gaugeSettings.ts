/**
 * Phone-only display settings for the Home screen's speed dials. These have
 * NO firmware representation — they only decide what counts as "full scale"
 * on each dial, so the needle's position is meaningful for a particular
 * installation.
 *
 * A dial is only readable if its range roughly matches the values actually
 * seen: a 0-100 W dial sitting at 3 W all day tells you nothing, and a
 * 0-60 °C dial is wrong for a system that never exceeds 25 °C. The right
 * full-scale value is an installation-specific choice, not a constant, so
 * it lives here and is adjustable in Settings.
 *
 * Both dials start at 0 — these are magnitudes where zero is meaningful, so
 * only the top of the scale is configurable.
 */
import { useSyncExternalStore } from "react";

export interface GaugeRanges {
  /** Full-scale value of the water-temperature dial, in °C. */
  tempMaxC: number;
  /** Full-scale value of the power dial, in W. */
  wattsMax: number;
}

const STORAGE_KEY = "njord.settings.gaugeRanges.v1";

export const DEFAULT_GAUGE_RANGES: GaugeRanges = {
  tempMaxC: 60,
  wattsMax: 100,
};

/** Guard rails for the Settings fields — wide enough to be useful, narrow
 *  enough that a typo can't produce an unreadable dial. */
export const TEMP_MAX_MIN = 10;
export const TEMP_MAX_MAX = 150;
export const WATTS_MAX_MIN = 10;
export const WATTS_MAX_MAX = 1000;

let ranges: GaugeRanges = readInitial();
const listeners = new Set<() => void>();

function readInitial(): GaugeRanges {
  if (typeof localStorage === "undefined") return DEFAULT_GAUGE_RANGES;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_GAUGE_RANGES;
  try {
    const parsed = JSON.parse(raw) as Partial<GaugeRanges>;
    const tempMaxC = Number(parsed.tempMaxC);
    const wattsMax = Number(parsed.wattsMax);
    if (
      !Number.isFinite(tempMaxC) || tempMaxC < TEMP_MAX_MIN || tempMaxC > TEMP_MAX_MAX ||
      !Number.isFinite(wattsMax) || wattsMax < WATTS_MAX_MIN || wattsMax > WATTS_MAX_MAX
    ) {
      return DEFAULT_GAUGE_RANGES;
    }
    return { tempMaxC, wattsMax };
  } catch {
    return DEFAULT_GAUGE_RANGES;
  }
}

function notify() {
  for (const l of listeners) l();
}

export function getGaugeRanges(): GaugeRanges {
  return ranges;
}

export function setGaugeRanges(next: GaugeRanges) {
  ranges = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  notify();
}

export function useGaugeRanges(): GaugeRanges {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => ranges,
  );
}
