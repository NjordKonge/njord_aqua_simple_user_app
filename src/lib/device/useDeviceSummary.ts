/**
 * The single hook the simplified UI is allowed to read device state from.
 *
 * Everything technical (raw mV, µC, ‰ duty, fault codes) is translated here,
 * so screens only ever bind to plain, already-meaningful values. If a screen
 * needs a new concept, add it to this layer rather than reaching into the
 * store — that keeps the product language in one reviewable place.
 */
import { useDevice, useConfig, useSonar, DEFAULT_CONFIG } from "./store";
import { summarizeStatus, type StatusSummary } from "./status";
import { summarizeHealth, type HealthSummary } from "./health";
import { summarizeProgress, type ProgressSummary } from "./progress";
import { summarizeCycleRing, type CycleRingSummary } from "./cycleRing";
import { summarizeWaterStatus, type WaterStatusSummary } from "./waterStatus";
import { summarizeTank, type TankSummary } from "./tank";
import { wattsFromStatus } from "./power";
import { dosingModeFromConfig, type DosingMode } from "./dosing";
import type { Device } from "./types";

export interface DeviceSummary {
  /** Undefined until a device has been paired. */
  device: Device | undefined;
  name: string;
  status: StatusSummary;
  waterStatus: WaterStatusSummary;
  health: HealthSummary | null;
  progress: ProgressSummary | null;
  tank: TankSummary;
  /** Current electrode power draw, watts. Null while offline. */
  watts: number | null;
  dosingMode: DosingMode;
  /** Configured cycle length (s), from the device's live config when known,
   *  else the same default the device itself boots with. Needed to turn a
   *  Normal/High percentage into an absolute `cycle_c` target — see
   *  lib/device/dosing.ts. */
  cycleSeconds: number;
  /** Live "operation cycle" progress — phase time elapsed/total and
   *  delivered/target charge — for the graph page's cycle rings. */
  cycleRing: CycleRingSummary;
  /** The current-controller's real target current (mA) — `target_ma`/`tma`,
   *  firmware `electrolysisTargetCurrentmA`. This is the actual setpoint the
   *  fixed-step PWM controller (AppStateMachine.cpp) drives the H-bridge
   *  duty toward, not an assumed constant — used for the Normal/High charge
   *  percentage math and the adjustable current field in Settings. */
  targetMa: number;
  /** Real-time "is the electrode actively driven right now" flag, from
   *  LiveStatus.phase (`ph`) === "ON". NOT derived from LiveStatus.elec_on:
   *  elec_on (AppStateMachine.cpp `eon`) is only `state == ELECTROLYSIS_ACTIVE`,
   *  which stays true for the *entire* cycle including the "WAIT" sub-phase
   *  (this cycle's charge target already reached, holding until the next
   *  cycle starts) — it never goes false until a full Stop. `phase` is the
   *  field that actually distinguishes driving from waiting. False while
   *  offline. */
  electrolysisOn: boolean;
  /** Three-state live status for the single "Live electrolysis status" LED:
   *  "on" = actively driving current, "waiting" = this cycle's charge target
   *  already reached (holding until the next cycle), "off" = not running an
   *  electrolysis cycle at all (or offline). */
  electrolysisState: "on" | "waiting" | "off";
  /** What the user is allowed to do right now. */
  actions: {
    canStart: boolean;
    canStop: boolean;
    canClearFault: boolean;
  };
  /** User-facing messages, most severe first. Empty when all is well. */
  attention: string[];
}

export function useDeviceSummary(deviceId: string | undefined): DeviceSummary {
  const device = useDevice(deviceId);
  const config = useConfig(deviceId);
  const sonar = useSonar(deviceId);

  const status = summarizeStatus(device);
  const waterStatus = summarizeWaterStatus(device);
  const online = Boolean(device?.online);
  const health = device && online ? summarizeHealth(device.status) : null;
  const progress = device && online ? summarizeProgress(device.status) : null;
  const tank = summarizeTank(config, sonar?.dist_mm);
  const dosingMode = dosingModeFromConfig(config);

  const hasFault = Boolean(device && device.status.fault !== "NONE");
  // Start/Stop gate on `elec_on` (state == ELECTROLYSIS_ACTIVE), not `phase`:
  // Stop must be offered throughout the whole cycle, including its "WAIT"
  // sub-phase, not just while the electrode is instantaneously driving.
  const elecOn = Boolean(device?.status.elec_on);
  // `phase` (LiveStatus `ph`, AppSM_GetCyclePhaseStr()) is "ON" while the
  // electrode is actually driving current, "WAIT" once this cycle's charge
  // target is reached and it's holding for the next cycle, or "" whenever
  // the state machine isn't in ELECTROLYSIS_ACTIVE at all (fully stopped).
  const phase = device?.status.phase ?? "";
  const driving = online && phase === "ON";
  const cycleWaiting = online && phase === "WAIT";
  // No current flows during WAIT or when fully stopped, so read straight to
  // 0 instead of deriving from cruise_duty_pm/elec_ma — those two only ever
  // get refreshed while the electrode is actually driving (idle-state
  // current sampling on the device is a 10 s poll, and cruise_duty_pm is
  // never reset at all on Stop), so trusting them here is what made Watts
  // look frozen at its last non-zero reading after a Stop.
  const watts = device && online ? (driving ? wattsFromStatus(device.status) : 0) : null;

  const attention = (device?.alarms ?? [])
    .slice()
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .map((a) => a.message);

  return {
    device,
    name: device?.name ?? "Njord Aqua",
    status,
    waterStatus,
    health,
    progress,
    tank,
    watts,
    dosingMode,
    cycleSeconds: config?.cycle_s ?? DEFAULT_CONFIG.cycle_s,
    cycleRing: summarizeCycleRing(
      device,
      config?.cycle_s ?? DEFAULT_CONFIG.cycle_s,
      config?.cycle_c ?? DEFAULT_CONFIG.cycle_c,
    ),
    targetMa: config?.target_ma ?? DEFAULT_CONFIG.target_ma,
    electrolysisOn: driving,
    electrolysisState: driving ? "on" : cycleWaiting ? "waiting" : "off",
    actions: {
      canStart: online && !elecOn && !hasFault,
      canStop: online && elecOn,
      canClearFault: online && hasFault,
    },
    attention,
  };
}

function severityRank(severity: string): number {
  switch (severity) {
    case "critical":
      return 3;
    case "error":
      return 2;
    case "warning":
      return 1;
    default:
      return 0;
  }
}
