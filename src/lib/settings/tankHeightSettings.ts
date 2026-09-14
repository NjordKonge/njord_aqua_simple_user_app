/**
 * Phone-only setting for the tank's total sonar-to-bottom height, in mm.
 *
 * The firmware config fields `tank_max_mm`/`fill_l_mm` (see the old
 * per-mm-litre calc this replaced in lib/device/tank.ts) proved unreliable
 * in practice — there's no app UI to set them and their stored values on
 * real units don't line up with the actual installation. Rather than
 * depend on those, the fill level is now computed straight from the raw
 * sonar distance reading and this single phone-local number: how far the
 * sensor is above the tank bottom (i.e. the distance reading when the tank
 * is empty). This has no SETCFG key — it is never sent over BLE.
 */
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "njord.settings.tankHeightMm.v1";

/** Reasonable default for a typical household tank until the user sets
 *  their own — see TANK_HEIGHT_MM_MIN/MAX below for the adjustable range. */
export const DEFAULT_TANK_HEIGHT_MM = 1500;

export const TANK_HEIGHT_MM_MIN = 200;
export const TANK_HEIGHT_MM_MAX = 5000;

let tankHeightMm: number = readInitial();
const listeners = new Set<() => void>();

function readInitial(): number {
  if (typeof localStorage === "undefined") return DEFAULT_TANK_HEIGHT_MM;
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw != null ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed < TANK_HEIGHT_MM_MIN || parsed > TANK_HEIGHT_MM_MAX) {
    return DEFAULT_TANK_HEIGHT_MM;
  }
  return parsed;
}

function notify() {
  for (const l of listeners) l();
}

export function getTankHeightMm(): number {
  return tankHeightMm;
}

export function setTankHeightMm(next: number) {
  tankHeightMm = next;
  localStorage.setItem(STORAGE_KEY, String(next));
  notify();
}

export function useTankHeightMm(): number {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => tankHeightMm,
  );
}
