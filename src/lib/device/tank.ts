/**
 * Tank level — derived from a raw sonar distance reading + the phone-local
 * "tank height" setting, NOT from the firmware's `tank_max_mm`/`fill_l_mm`
 * config fields.
 *
 * Firmware fields (BLE_DEVELOPER_GUIDE.md §7, and the technical app's own
 * sonar debug tab):
 *   tank_l — tank capacity in litres. Still a real, user-set config field
 *            (Settings → Tank volume) and used here for the litres figure.
 *
 * `tank_max_mm`/`fill_l_mm` (the sonar-distance-to-litres calibration) are
 * NOT used any more — there's no app UI to set them and their values on
 * real units don't reliably match the physical installation, which made the
 * tank level read wrong. Instead:
 *
 *   percent = clamp((tankHeightMm - dist_mm) / tankHeightMm * 100, 0, 100)
 *   liters  = percent/100 * tank_l
 *
 * where `tankHeightMm` is the phone-local setting in
 * lib/settings/tankHeightSettings.ts (Settings → Tank setup → Tank height):
 * the sonar distance reading when the tank is empty (sensor mounted at the
 * top, looking down at the bottom).
 *
 * The sonar sensor is NOT polled continuously by the firmware — a reading
 * only exists after a `sonar_shot` command (see requestTankReading below,
 * reusing the same command the technical app's Sonar tab sends; SonarDbg
 * notifications are armed automatically on connect). Home requests one on
 * a timer (see TANK_REFRESH_MS in routes/index.tsx) and logs each resulting
 * level to lib/device/tankLog.ts, which derives the "water used" figure.
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
  tankHeightMm: number,
): TankSummary {
  const capacityLiters = config?.tank_l ?? 0;

  if (distMm == null || tankHeightMm <= 0) {
    return { liters: null, capacityLiters, percent: null, low: false, hasReading: false };
  }

  const percent = Math.max(0, Math.min(100, Math.round(((tankHeightMm - distMm) / tankHeightMm) * 100)));
  const liters = capacityLiters > 0 ? (percent / 100) * capacityLiters : null;

  return {
    liters,
    capacityLiters,
    percent,
    low: percent <= TANK_LOW_PERCENT,
    hasReading: true,
  };
}

/** Fires a single sonar capture (existing, supported firmware command). */
export function requestTankReading(deviceId: string) {
  return sendCommand(deviceId, "sonar_shot");
}

