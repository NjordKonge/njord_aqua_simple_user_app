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
  /** Real-time "is the electrode actively driven right now" flag, straight
   *  from LiveStatus.elec_on (`eon`) — NOT derived from dosingMode/config.
   *  elec_on can be false even while chlorination is enabled (elec_en=1)
   *  during a cycle's REST phase, so this is the correct source for a
   *  physical-LED-style live indicator. False while offline. */
  electrolysisOn: boolean;
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
  const watts = device && online ? wattsFromStatus(device.status) : null;
  const dosingMode = dosingModeFromConfig(config);

  const hasFault = Boolean(device && device.status.fault !== "NONE");
  // The technical app toggles start/stop on `elec_on` rather than `state`,
  // because the electrode can be off during a REST phase while the device is
  // still nominally "active". Match that behaviour exactly.
  const elecOn = Boolean(device?.status.elec_on);

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
    electrolysisOn: online && elecOn,
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
