/**
 * "Operation cycle" ring summary — how far through the current cycle's
 * phase timer and delivered charge the device is right now.
 *
 * Mirrors the technical app's CycleRing (see njord-aqua-main), which reads
 * straight off LiveStatus's device-authoritative phase clock
 * (`phase_elapsed_ms`/`phase_total_ms`, "cms"/"ctm" on the wire) rather than
 * a host-side stopwatch, so it never drifts and resyncs on every notify.
 */
import type { Device } from "./types";

export interface CycleRingSummary {
  online: boolean;
  active: boolean;
  /** Elapsed ms in the current cycle phase. 0 when idle. */
  elapsedMs: number;
  /** Total ms for the current cycle phase — device-reported when active,
   *  else falls back to the configured cycle length. */
  totalMs: number;
  /** Whether `elapsedMs`/`totalMs` came from the device's own phase clock
   *  (`phase_elapsed_ms`/`phase_total_ms`, API v2.8+/v2.10+). False on
   *  older firmware that doesn't report those fields (both stay 0) — the
   *  ring then needs a host-side stopwatch fallback instead of trusting
   *  `elapsedMs`, which would otherwise sit stuck at 0. */
  hasDeviceClock: boolean;
  /** Delivered charge this cycle, in Coulombs (device reports µC). */
  deliveredC: number;
  /** Target charge this cycle, in Coulombs. Falls back to the configured
   *  `cycle_c` while idle (before a cycle has actually started and the
   *  device has computed a live target_uc). */
  targetC: number;
  /** Instantaneous electrode current, mA. */
  elecMa: number;
  /** "Treating" / "Resting" / "Waiting" / "Idle" in user language. */
  phaseLabel: string;
  /** Device RTC clock "HH:MM:SS", or null while offline. */
  deviceTime: string | null;
}

const PHASE_LABEL: Record<string, string> = {
  ON: "Treating",
  REST: "Resting",
  WAIT: "Waiting",
};

export function summarizeCycleRing(
  device: Device | undefined,
  cycleSeconds: number,
  cycleCoulombs: number,
): CycleRingSummary {
  const online = Boolean(device?.online);
  const status = online ? device?.status : undefined;
  const active = status?.state === "ELECTROLYSIS_ACTIVE";
  const hasDeviceClock = Boolean(status && (status.phase_total_ms > 0 || status.phase_elapsed_ms > 0));

  const totalMs = active && status && status.phase_total_ms > 0
    ? status.phase_total_ms
    : Math.max(1, cycleSeconds) * 1000;
  const elapsedMs = active && status ? Math.min(totalMs, status.phase_elapsed_ms) : 0;

  const targetC = status && status.target_uc > 0 ? status.target_uc / 1_000_000 : cycleCoulombs;
  const deliveredC = status ? status.deliv_uc / 1_000_000 : 0;

  return {
    online,
    active: Boolean(active),
    elapsedMs,
    totalMs,
    hasDeviceClock,
    deliveredC,
    targetC,
    elecMa: status?.elec_ma ?? 0,
    phaseLabel: active ? (PHASE_LABEL[status?.phase ?? ""] ?? "Treating") : "Idle",
    deviceTime: online ? status?.time ?? null : null,
  };
}
