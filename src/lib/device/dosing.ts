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
 * target means a higher resulting chlorine concentration.
 *
 * Rather than configuring Normal/High as raw coulomb numbers (which only
 * make sense in the context of a particular cycle length), Settings exposes
 * them as *percentages of the theoretical max charge deliverable in one
 * cycle* — `MAX_CURRENT_CAP_A * cycle_s` (amps × seconds = coulombs). That
 * way the two modes stay sensible if the installer later changes the cycle
 * length, instead of silently becoming a tiny or an out-of-range fraction
 * of the new cycle. See lib/settings/chlorinationSettings.ts for the
 * stored percentages.
 */
import type { NjordConfig } from "./types";
import { updateConfig, sendCommand } from "./store";
import { getChlorinationLevels } from "@/lib/settings/chlorinationSettings";

export type DosingMode = "off" | "normal" | "high";

/** Electrode hardware current cap (A). Fixed hardware fact, not a firmware
 *  config value — used only to compute the "theoretical max charge this
 *  cycle" reference (coulombs = amps × seconds). */
export const MAX_CURRENT_CAP_A = 3;

/** Coulombs deliverable in one cycle if the electrode ran at the hardware
 *  current cap for the whole cycle. */
export function theoreticalMaxChargeC(cycleSeconds: number): number {
  return MAX_CURRENT_CAP_A * cycleSeconds;
}

/** SETCFG's validated range for `cycle_c` (see store.ts validateConfig). */
const CYCLE_C_MIN = 1;
const CYCLE_C_MAX = 4000;

function chargeForPct(pct: number, cycleSeconds: number): number {
  const raw = Math.round((pct / 100) * theoreticalMaxChargeC(cycleSeconds));
  return Math.min(CYCLE_C_MAX, Math.max(CYCLE_C_MIN, raw));
}

export function dosingModeFromConfig(config: NjordConfig | undefined): DosingMode {
  if (!config || !config.elec_en) return "off";
  const { normalPct, highPct } = getChlorinationLevels();
  const normalC = chargeForPct(normalPct, config.cycle_s);
  const highC = chargeForPct(highPct, config.cycle_s);
  const distNormal = Math.abs(config.cycle_c - normalC);
  const distHigh = Math.abs(config.cycle_c - highC);
  return distHigh < distNormal ? "high" : "normal";
}

/** `cycleSeconds` should come from the device's live config (`cfg.cycle_s`)
 *  — the caller (useDeviceSummary) already falls back to DEFAULT_CONFIG's
 *  value when no config has been read yet. */
export function setDosingMode(deviceId: string, mode: DosingMode, cycleSeconds: number) {
  if (mode === "off") {
    return sendCommand(deviceId, "stop_treatment");
  }
  const { normalPct, highPct } = getChlorinationLevels();
  const pct = mode === "high" ? highPct : normalPct;
  updateConfig(deviceId, { cycle_c: chargeForPct(pct, cycleSeconds) });
  return sendCommand(deviceId, "start_treatment");
}

