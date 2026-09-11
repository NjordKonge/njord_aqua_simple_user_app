/**
 * Phone-only setting: how many minutes of continuous electrolysis the
 * Home screen's "Water status" cup treats as "long enough to be safe".
 *
 * This has NO firmware representation — the device does not report a
 * water-safety signal, so this is a placeholder heuristic (a plain timer
 * since treatment last started) rather than a real measurement. See
 * lib/device/waterTreatment.ts for how it's used.
 */
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "njord.settings.treatmentMinutes.v1";

export const DEFAULT_TREATMENT_MINUTES = 30;

/** Guard rails for the Settings field. */
export const TREATMENT_MINUTES_MIN = 1;
export const TREATMENT_MINUTES_MAX = 180;

let minutes: number = readInitial();
const listeners = new Set<() => void>();

function readInitial(): number {
  if (typeof localStorage === "undefined") return DEFAULT_TREATMENT_MINUTES;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_TREATMENT_MINUTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < TREATMENT_MINUTES_MIN || parsed > TREATMENT_MINUTES_MAX) {
    return DEFAULT_TREATMENT_MINUTES;
  }
  return parsed;
}

function notify() {
  for (const l of listeners) l();
}

export function getTreatmentMinutes(): number {
  return minutes;
}

export function setTreatmentMinutes(next: number) {
  minutes = next;
  localStorage.setItem(STORAGE_KEY, String(next));
  notify();
}

export function useTreatmentMinutes(): number {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => minutes,
  );
}
