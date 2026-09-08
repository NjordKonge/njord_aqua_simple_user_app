/**
 * Purely local, phone-only settings that have NO dedicated firmware
 * representation of their own.
 *
 * They configure what the Home screen's "Normal" and "High" chlorination
 * mode buttons actually write to the device's `cycle_c` config field
 * (`cyc`, firmware `cycleCoulombsTarget` — "target coulombs delivered per
 * cycle", BLE_DEVELOPER_GUIDE.md §7 / DeviceConfig.h). The firmware only
 * understands a target-charge-per-cycle number; "Normal" and "High" are
 * app-side labels for two charge levels, and the right value for each is an
 * installation-specific tuning choice (electrode size, tank volume, desired
 * chlorine output) rather than a firmware constant — so it lives here,
 * phone-side, and is never sent over BLE by itself (only `cycle_c` is).
 */
import { useSyncExternalStore } from "react";

export interface ChlorinationLevels {
  normalChargeC: number;
  highChargeC: number;
}

const STORAGE_KEY = "njord.settings.chlorinationLevels";

// Matches the app's pre-existing DEFAULT_CONFIG.cycle_c (3600 C); "High"
// defaults to double that pending installer tuning for the real hardware.
export const DEFAULT_CHLORINATION_LEVELS: ChlorinationLevels = {
  normalChargeC: 3600,
  highChargeC: 7200,
};

let levels: ChlorinationLevels = readInitial();
const listeners = new Set<() => void>();

function readInitial(): ChlorinationLevels {
  if (typeof localStorage === "undefined") return DEFAULT_CHLORINATION_LEVELS;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_CHLORINATION_LEVELS;
  try {
    const parsed = JSON.parse(raw) as Partial<ChlorinationLevels>;
    const normalChargeC = Number(parsed.normalChargeC);
    const highChargeC = Number(parsed.highChargeC);
    if (!Number.isFinite(normalChargeC) || !Number.isFinite(highChargeC)) {
      return DEFAULT_CHLORINATION_LEVELS;
    }
    return { normalChargeC, highChargeC };
  } catch {
    return DEFAULT_CHLORINATION_LEVELS;
  }
}

function notify() {
  for (const l of listeners) l();
}

/** Non-reactive getter for use outside React (e.g. dosing.ts command builders). */
export function getChlorinationLevels(): ChlorinationLevels {
  return levels;
}

export function setChlorinationLevels(next: ChlorinationLevels) {
  levels = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  notify();
}

export function useChlorinationLevels(): ChlorinationLevels {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => levels,
  );
}
