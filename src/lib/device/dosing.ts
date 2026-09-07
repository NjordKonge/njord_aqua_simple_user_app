/**
 * Dosing mode — maps the spec's two-preset toggle onto the real firmware
 * config field `target_cl_mg_l` ("Target chloride (mg/L)", see
 * BLE_DEVELOPER_GUIDE.md §7). Both presets are written via the same
 * `updateConfig` / SETCFG path the technical app already uses; no new
 * commands are introduced.
 *
 * Spec ranges:
 *   Standard safe:     0.5–1 mg/L  -> written as 0.75 mg/L (midpoint)
 *   Extra high dose:   1–3 mg/L    -> written as 2 mg/L    (midpoint)
 */
import type { NjordConfig } from "./types";
import { updateConfig } from "./store";

export type DosingMode = "standard_safe" | "extra_high_dose";

export const DOSING_TARGET_CL_MG_L: Record<DosingMode, number> = {
  standard_safe: 0.75,
  extra_high_dose: 2,
};

/** Boundary between the two spec ranges (1 mg/L belongs to "extra high"). */
const MODE_BOUNDARY_MG_L = 1;

export function dosingModeFromConfig(config: NjordConfig | undefined): DosingMode {
  if (!config) return "standard_safe";
  return config.target_cl_mg_l >= MODE_BOUNDARY_MG_L ? "extra_high_dose" : "standard_safe";
}

export function setDosingMode(deviceId: string, mode: DosingMode) {
  return updateConfig(deviceId, { target_cl_mg_l: DOSING_TARGET_CL_MG_L[mode] });
}
