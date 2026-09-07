/**
 * Tank level — derived from firmware config + on-demand sonar reading.
 *
 * Firmware fields (BLE_DEVELOPER_GUIDE.md §7, and the technical app's own
 * sonar debug tab, which labels fill_l_mm's unit as "L/mm"):
 *   tank_l       — tank capacity in litres
 *   tank_max_mm  — sonar distance (mm) reading that corresponds to an empty
 *                  tank (sensor mounted at the top, looking down)
 *   fill_l_mm    — litres represented by each mm of water column
 *
 * litres = (tank_max_mm - dist_mm) * fill_l_mm, clamped to [0, tank_l].
 *
 * IMPORTANT: the sonar sensor is NOT polled continuously by the existing
 * app — a reading only exists after a `sonar_shot` command (see
 * requestTankReading below, which reuses the same command the technical
 * app's Sonar tab already sends; SonarDbg notifications are armed
 * automatically on connect, so this is safe to call directly).
 *
 * INTERIM: this linear mm->litre calc is a placeholder. Long-term, the
 * firmware is expected to compute litres itself from sonar + tank version
 * and report it directly — see patch.md §2 for the planned field and what
 * needs to change here once it lands.
 */
import type { NjordConfig } from "./types";
import { sendCommand } from "./store";

/** Below this percentage, the tank UI switches to the "near-empty" tone. */
export const TANK_LOW_PERCENT = 15;

export interface TankSummary {
  /** null until a sonar reading has been taken this session. */
  liters: number | null;
  capacityLiters: number;
  /** null when `liters` is null. */
  percent: number | null;
  low: boolean;
  hasReading: boolean;
}

export function summarizeTank(
  config: NjordConfig | undefined,
  distMm: number | undefined,
): TankSummary {
  const capacityLiters = config?.tank_l ?? 0;

  if (!config || distMm == null) {
    return { liters: null, capacityLiters, percent: null, low: false, hasReading: false };
  }

  const raw = (config.tank_max_mm - distMm) * config.fill_l_mm;
  const liters = Math.max(0, Math.min(capacityLiters, raw));
  const percent = capacityLiters > 0 ? Math.round((liters / capacityLiters) * 100) : null;

  return {
    liters,
    capacityLiters,
    percent,
    low: percent !== null && percent <= TANK_LOW_PERCENT,
    hasReading: true,
  };
}

/** Fires a single sonar capture (existing, supported firmware command). */
export function requestTankReading(deviceId: string) {
  return sendCommand(deviceId, "sonar_shot");
}
