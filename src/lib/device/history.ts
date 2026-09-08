/**
 * Firmware flash-log bridge for the Overview graphs.
 *
 * The device keeps its own on-flash history (TEL/STT/SON records — see
 * BLE_DEVELOPER_GUIDE.md §"Download workflow") independent of whether the
 * app is open. Without this, the Overview charts only ever showed
 * `telemetry`/`sonarHistory` — rolling in-memory buffers fed by LiveStatus
 * notifications while THIS app session was connected (capped at 240
 * samples, i.e. minutes, not days) — so closing the app for a day and
 * reopening it showed almost nothing.
 *
 * `useHistoryLog` triggers a ranged `start_log_download` (STARTLOGDL with
 * from_ts/to_ts) for the selected range and reads the parsed result back
 * from the store's `logs[deviceId]` (populated by store.ts's LogData chunk
 * reassembly). Downloads are cheap to skip-repeat: a module-level
 * timestamp cache avoids re-requesting the same device+range more than
 * once a minute, so revisiting the Overview tab doesn't re-download the
 * whole window every time.
 */
import { useEffect, useMemo } from "react";
import { NJORD_EPOCH_OFFSET } from "./types";
import type { LogEntry, TelemetryLogEntry, TelemetrySample, SonarLogEntry } from "./types";
import { sendCommand, useLogs, useLogProgress, type SonarSample } from "./store";

export type HistoryRange = "daily" | "weekly" | "monthly";

export const RANGE_WINDOW_MS: Record<HistoryRange, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

/** Label for chart x-axis start (end is always "now"). */
export const RANGE_SINCE_LABEL: Record<HistoryRange, string> = {
  daily: "24h ago",
  weekly: "7d ago",
  monthly: "30d ago",
};

/** Short form for section headings, e.g. "Water temperature — last 24h". */
export const RANGE_SHORT_LABEL: Record<HistoryRange, string> = {
  daily: "24h",
  weekly: "7d",
  monthly: "30d",
};

/** Host `Date.now()`-style ms → device wire epoch (whole seconds since
 *  2000-01-01 UTC, BLE_API_SPEC.md §6). */
function toDeviceTs(ms: number): number {
  return Math.floor(ms / 1000) - NJORD_EPOCH_OFFSET;
}

/** Flash-log entry's device-epoch `ts` (seconds since 2000-01-01) → host
 *  `Date.now()`-comparable ms timestamp. */
function fromDeviceTs(ts: number): number {
  return (ts + NJORD_EPOCH_OFFSET) * 1000;
}

const lastRequestedAt = new Map<string, number>();
const MIN_REFETCH_INTERVAL_MS = 60_000;

/**
 * Requests the firmware's flash log for `range` (throttled per
 * deviceId+range) and returns the parsed entries plus a `loading` flag for
 * the very first fetch.
 */
export function useHistoryLog(deviceId: string | undefined, online: boolean, range: HistoryRange) {
  const entries = useLogs(deviceId);
  const progress = useLogProgress(deviceId);

  useEffect(() => {
    if (!deviceId || !online) return;
    const key = `${deviceId}:${range}`;
    const last = lastRequestedAt.get(key) ?? 0;
    if (Date.now() - last < MIN_REFETCH_INTERVAL_MS) return;
    lastRequestedAt.set(key, Date.now());
    const now = Date.now();
    sendCommand(deviceId, "start_log_download", {
      from_ts: toDeviceTs(now - RANGE_WINDOW_MS[range]),
      to_ts: toDeviceTs(now),
    });
  }, [deviceId, online, range]);

  const loading = entries.length === 0 && progress != null && progress.completedAt == null && !progress.cancelled;
  return { entries, loading };
}

/** Adapts a flash-log TEL row to the same shape the live rolling buffer
 *  uses, so both can feed the same chart/derivation helpers
 *  (voltsFromTelemetry/wattsFromTelemetry in power.ts). `elec_mv` isn't
 *  carried by the flash log, but it's fully derivable from cruise_duty_pm +
 *  supply_mv — same formula power.ts already applies for the live buffer. */
function telemetryLogToSample(e: TelemetryLogEntry): TelemetrySample {
  return {
    t: fromDeviceTs(e.ts),
    elec_ma: e.cycle_avg_ma,
    batt_mv: e.battery_mv,
    solar_mv: e.solar_mv,
    supply_mv: e.supply_mv,
    temp_c: e.temp_c,
    cruise_duty_pm: e.cruise_duty_pm,
    deliv_uc: e.delivered_uc,
  };
}

function sonarLogToSample(e: SonarLogEntry): SonarSample {
  return {
    t: fromDeviceTs(e.ts),
    dist_mm: e.dist_mm,
    baseline: e.baseline,
    peak_delta: e.peak_delta,
    peak_idx: 0,
    sample_count: 0,
  };
}

/**
 * Merges downloaded flash-log telemetry with the live rolling buffer (for
 * the tail end more recent than the last log write), sorted and deduped by
 * timestamp, clipped to `sinceMs`.
 */
export function useMergedTelemetry(
  logEntries: LogEntry[],
  live: TelemetrySample[],
  sinceMs: number,
): TelemetrySample[] {
  return useMemo(() => {
    const fromLog = logEntries
      .filter((e): e is TelemetryLogEntry => e.type === "TEL")
      .map(telemetryLogToSample);
    const newestLogT = fromLog.reduce((max, s) => Math.max(max, s.t), 0);
    const tail = live.filter((s) => s.t > newestLogT);
    return [...fromLog, ...tail]
      .filter((s) => s.t >= sinceMs)
      .sort((a, b) => a.t - b.t);
  }, [logEntries, live, sinceMs]);
}

/** Same merge strategy as `useMergedTelemetry`, for sonar/tank-level samples. */
export function useMergedSonar(
  logEntries: LogEntry[],
  live: SonarSample[],
  sinceMs: number,
): SonarSample[] {
  return useMemo(() => {
    const fromLog = logEntries
      .filter((e): e is SonarLogEntry => e.type === "SON")
      .map(sonarLogToSample);
    const newestLogT = fromLog.reduce((max, s) => Math.max(max, s.t), 0);
    const tail = live.filter((s) => s.t > newestLogT);
    return [...fromLog, ...tail]
      .filter((s) => s.t >= sinceMs)
      .sort((a, b) => a.t - b.t);
  }, [logEntries, live, sinceMs]);
}
