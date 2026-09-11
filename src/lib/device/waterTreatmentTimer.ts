/**
 * "Water status" for the Home screen's big status cup — a placeholder
 * heuristic, NOT a real safety measurement. The firmware has no sensor for
 * "is this water actually safe to use" (see lib/device/waterStatus.ts's own
 * doc comment, which explains the same gap for the other status row). Until
 * there is one, this treats "electrolysis has been running continuously for
 * at least N minutes" (N adjustable in Settings) as the proxy for "treated
 * enough to be safe" — hence "for now" in the product ask this implements.
 *
 * The clock is phone-local (localStorage, keyed by device id) rather than
 * derived from any device field, because the device doesn't expose one.
 * Turning treatment off clears it immediately, so the next time it starts
 * the wait begins from zero again — it is not a cumulative total.
 */
import { useEffect, useState } from "react";

export type TreatmentStatus = "unknown" | "red" | "yellow" | "green";

export interface TreatmentStatusSummary {
  status: TreatmentStatus;
  /** Minutes left before `status` would flip from "yellow" to "green". Only
   *  meaningful when `status === "yellow"`. */
  remainingMinutes: number;
}

const STORAGE_PREFIX = "njord.treatmentStartedAt.";

// How often to re-check the clock while treatment is running, so the
// countdown display updates on its own instead of only on unrelated
// re-renders. A minute-granularity readout doesn't need anything finer.
const TICK_MS = 15_000;

function getStartedAt(deviceId: string): number | null {
  const raw = localStorage.getItem(STORAGE_PREFIX + deviceId);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function setStartedAt(deviceId: string, at: number | null) {
  if (at === null) {
    localStorage.removeItem(STORAGE_PREFIX + deviceId);
  } else {
    localStorage.setItem(STORAGE_PREFIX + deviceId, String(at));
  }
}

export function useTreatmentStatus(
  deviceId: string | undefined,
  connected: boolean,
  active: boolean,
  treatmentMinutes: number,
): TreatmentStatusSummary {
  const [, setTick] = useState(0);

  // Start/clear the clock on an off->on / on->off edge (and on mount, if
  // it's already running with nothing recorded yet — the normal case when
  // Home mounts mid-treatment).
  useEffect(() => {
    if (!deviceId) return;
    if (active) {
      if (getStartedAt(deviceId) === null) setStartedAt(deviceId, Date.now());
    } else {
      setStartedAt(deviceId, null);
    }
  }, [deviceId, active]);

  // Re-render periodically while treating, so the countdown counts down on
  // its own instead of only when something else happens to re-render Home.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, [active]);

  if (!connected || !deviceId) {
    return { status: "unknown", remainingMinutes: 0 };
  }
  if (!active) {
    return { status: "red", remainingMinutes: 0 };
  }

  const startedAt = getStartedAt(deviceId) ?? Date.now();
  const elapsedMs = Date.now() - startedAt;
  const remainingMs = treatmentMinutes * 60_000 - elapsedMs;

  if (remainingMs > 0) {
    return { status: "yellow", remainingMinutes: Math.ceil(remainingMs / 60_000) };
  }
  return { status: "green", remainingMinutes: 0 };
}
