/**
 * Purely local, phone-only settings that have NO dedicated firmware
 * representation of their own.
 *
 * They configure what the Home screen's "Normal" and "High" chlorination
 * mode buttons actually write to the device's `cycle_c` config field
 * (`cyc`, firmware `cycleCoulombsTarget` — "target coulombs delivered per
 * cycle", BLE_DEVELOPER_GUIDE.md §7 / DeviceConfig.h). The firmware only
 * understands a target-charge-per-cycle number; "Normal" and "High" are
 * app-side labels for two charge levels.
 *
 * Stored as *percentages of the theoretical max charge for one cycle*
 * (`MAX_CURRENT_CAP_A * cycle_s`, see lib/device/dosing.ts) rather than raw
 * coulombs, so they stay meaningful if the installer changes the cycle
 * length in Settings — a fixed coulomb number would silently become a tiny
 * or an out-of-range fraction of a differently-sized cycle. The right
 * percentage for a given electrode/tank is still an installation-specific
 * tuning choice, not a firmware constant — so it lives here, phone-side,
 * and is never sent over BLE by itself (only the resulting `cycle_c` is).
 */
import { useSyncExternalStore } from "react";

export interface ChlorinationLevels {
  /** 1..100, percent of theoretical max charge for the current cycle length. */
  normalPct: number;
  /** 1..100, percent of theoretical max charge for the current cycle length. */
  highPct: number;
}

const STORAGE_KEY = "njord.settings.chlorinationLevels.v2";

// Roughly matches the app's original fixed defaults (3600 C / 7200 C at the
// stock 3600 s cycle length, out of a 10800 C theoretical max at 3A).
export const DEFAULT_CHLORINATION_LEVELS: ChlorinationLevels = {
  normalPct: 33,
  highPct: 67,
};

let levels: ChlorinationLevels = readInitial();
const listeners = new Set<() => void>();

function readInitial(): ChlorinationLevels {
  if (typeof localStorage === "undefined") return DEFAULT_CHLORINATION_LEVELS;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_CHLORINATION_LEVELS;
  try {
    const parsed = JSON.parse(raw) as Partial<ChlorinationLevels>;
    const normalPct = Number(parsed.normalPct);
    const highPct = Number(parsed.highPct);
    if (
      !Number.isFinite(normalPct) || normalPct < 1 || normalPct > 100 ||
      !Number.isFinite(highPct) || highPct < 1 || highPct > 100
    ) {
      return DEFAULT_CHLORINATION_LEVELS;
    }
    return { normalPct, highPct };
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
