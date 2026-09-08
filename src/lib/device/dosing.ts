/**
 * Chlorination mode — Off / Normal / High.
 *
 * "Off" reuses the exact same STOP/START commands the Home screen's
 * Start/Stop buttons already send (`stop_treatment` / `start_treatment`).
 * On the firmware, both `AppSM_StartElectrolysis()` and
 * `AppSM_StopElectrolysis()` simply flip the persisted `elec_en`
 * (`electrolysisEnabled`) config flag and drive the state machine
 * (AppStateMachine.cpp) — writing `elec_en` directly via SETCFG instead
 * would bypass that state-machine transition, so this deliberately issues
 * the same START/STOP commands the technical app uses rather than inventing
 * a new mechanism.
 *
 * "Normal" and "High" both mean "electrolysis on" — they differ only in how
 * much charge is targeted per cycle, via the existing `cycle_c` config field
 * (`cyc`, firmware `cycleCoulombsTarget` — "target coulombs per cycle",
 * BLE_DEVELOPER_GUIDE.md §7). More delivered charge generates more chlorine
 * (via the firmware's own `gen_mg_per_c` conversion), so a higher charge
 * target means a higher resulting chlorine concentration — but the app
 * targets a *charge level* for these two modes, not a chlorine
 * concentration directly, matching how the technical app's `cycle_c`
 * control works. The actual Normal/High coulomb values are configurable in
 * Settings (see lib/settings/chlorinationSettings.ts) since the right
 * charge for a given electrode/tank is an installation-specific tuning
 * value, not a firmware constant.
 */
import type { NjordConfig } from "./types";
import { updateConfig, sendCommand } from "./store";
import { getChlorinationLevels } from "@/lib/settings/chlorinationSettings";

export type DosingMode = "off" | "normal" | "high";

export function dosingModeFromConfig(config: NjordConfig | undefined): DosingMode {
  if (!config || !config.elec_en) return "off";
  const { normalChargeC, highChargeC } = getChlorinationLevels();
  const distNormal = Math.abs(config.cycle_c - normalChargeC);
  const distHigh = Math.abs(config.cycle_c - highChargeC);
  return distHigh < distNormal ? "high" : "normal";
}

export function setDosingMode(deviceId: string, mode: DosingMode) {
  if (mode === "off") {
    return sendCommand(deviceId, "stop_treatment");
  }
  const { normalChargeC, highChargeC } = getChlorinationLevels();
  updateConfig(deviceId, { cycle_c: mode === "high" ? highChargeC : normalChargeC });
  return sendCommand(deviceId, "start_treatment");
}
