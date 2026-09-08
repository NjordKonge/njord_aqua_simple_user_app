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
 * make sense in the context of a particular cycle length AND a particular
 * electrode current), Settings exposes them as *percentages of the
 * theoretical max charge deliverable in one cycle* —
 * `target_ma (A) * cycle_s (s)` (amps × seconds = coulombs), using the
 * device's REAL, currently-configured current-controller setpoint
 * (`target_ma`/`tma`/`electrolysisTargetCurrentmA` — see
 * AppStateMachine.cpp's fixed-step current controller, which drives the
 * H-bridge PWM duty every 100 ms to track this exact target). That way the
 * two modes stay physically meaningful if the installer later changes the
 * cycle length or the target current, instead of silently becoming a wrong
 * fraction of a differently-sized cycle or a target current the electrode
 * isn't actually being driven at. See lib/settings/chlorinationSettings.ts
 * for the stored percentages.
 */
import type { NjordConfig } from "./types";
import { updateConfig, sendCommand } from "./store";
import { getChlorinationLevels } from "@/lib/settings/chlorinationSettings";

export type DosingMode = "off" | "normal" | "high";

/** User-adjustable range for `target_ma` in Settings. The firmware itself
 *  accepts 0..5000 mA (njord_gatt.cpp SETCFG validation), but the app caps
 *  the adjustable range at 3 A as requested — comfortably under the
 *  firmware's 4.5 A hard overcurrent fault threshold
 *  (cOvercurrentThresholdMa, AppStateMachine.cpp). */
export const TARGET_CURRENT_MIN_MA = 1;
export const TARGET_CURRENT_MAX_MA = 3000;

/** Coulombs deliverable in one cycle if the electrode ran at `targetMa` for
 *  the whole cycle (it won't literally run the whole time — REST/ramp
 *  phases exist — but this is the same "max possible" reference the
 *  technical app's tuning screens use). */
export function theoreticalMaxChargeC(cycleSeconds: number, targetMa: number): number {
  return Math.round((targetMa / 1000) * cycleSeconds);
}

/** SETCFG's validated range for `cycle_c` (see store.ts validateConfig). */
const CYCLE_C_MIN = 1;
const CYCLE_C_MAX = 4000;

function chargeForPct(pct: number, cycleSeconds: number, targetMa: number): number {
  const raw = Math.round((pct / 100) * theoreticalMaxChargeC(cycleSeconds, targetMa));
  return Math.min(CYCLE_C_MAX, Math.max(CYCLE_C_MIN, raw));
}

export function dosingModeFromConfig(config: NjordConfig | undefined): DosingMode {
  if (!config || !config.elec_en) return "off";
  const { normalPct, highPct } = getChlorinationLevels();
  const normalC = chargeForPct(normalPct, config.cycle_s, config.target_ma);
  const highC = chargeForPct(highPct, config.cycle_s, config.target_ma);
  const distNormal = Math.abs(config.cycle_c - normalC);
  const distHigh = Math.abs(config.cycle_c - highC);
  return distHigh < distNormal ? "high" : "normal";
}

/** `cycleSeconds`/`targetMa` should come from the device's live config
 *  (`cfg.cycle_s`/`cfg.target_ma`) — the caller (useDeviceSummary) already
 *  falls back to DEFAULT_CONFIG's values when no config has been read yet.
 *
 * Normal/High always STOP before applying the new `cycle_c` and STARTing
 * again, even if electrolysis was already running (e.g. switching Normal ->
 * High mid-cycle). On the firmware, START (`AppSM_StartElectrolysis`) only
 * actually (re)starts a cycle from `UpdateIdle()` — sending it while already
 * `ELECTROLYSIS_ACTIVE` is a no-op, so a plain "update config then START"
 * would leave the CURRENT cycle running (at the OLD target) until it timed
 * out on its own, silently ignoring the new target charge for up to a whole
 * cycle. STOP (`AppSM_StopElectrolysis`) IS handled from the active state
 * (`UpdateElectrolysis` checks it every tick) and drops straight to IDLE, so
 * STOP → SETCFG → START reliably forces a fresh cycle (`EnterElectrolysis`)
 * at the newly-selected charge target every time the mode changes. */
export function setDosingMode(
  deviceId: string,
  mode: DosingMode,
  cycleSeconds: number,
  targetMa: number,
) {
  if (mode === "off") {
    return sendCommand(deviceId, "stop_treatment");
  }
  sendCommand(deviceId, "stop_treatment");
  const { normalPct, highPct } = getChlorinationLevels();
  const pct = mode === "high" ? highPct : normalPct;
  updateConfig(deviceId, { cycle_c: chargeForPct(pct, cycleSeconds, targetMa) });
  return sendCommand(deviceId, "start_treatment");
}

