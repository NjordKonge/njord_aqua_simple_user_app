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

export type HistoryRange = "1h" | "5h" | "daily" | "weekly" | "monthly";

export const RANGE_WINDOW_MS: Record<HistoryRange, number> = {
  "1h": 60 * 60 * 1000,
  "5h": 5 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

/** Short form for section headings, e.g. "Water temperature — last 24h". */
export const RANGE_SHORT_LABEL: Record<HistoryRange, string> = {
  "1h": "1h",
  "5h": "5h",
  daily: "24h",
  weekly: "7d",
  monthly: "30d",
};

/** Formats a host ms timestamp as a short relative "X ago" label. Used for
 *  chart x-axis labels, always computed from the actual oldest/newest
 *  PLOTTED sample rather than the nominal requested window — a chart with
 *  only 3h of real data must say "3h ago", never "24h ago", even when the
 *  request asked for a 24h window. */
export function formatRelativeAgo(ms: number): string {
  const diffMs = Date.now() - ms;
  if (diffMs < 45_000) return "just now";
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(diffMs / 86_400_000);
  if (days < 14) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  return `${weeks}w ago`;
}

/** X-axis start/end labels for a chart series, derived from the samples
 *  actually being drawn (not the requested range) so they can never claim
 *  the chart reaches further back — or more recent — than it really does. */
export function chartAxisLabels(series: Array<{ t: number }>): { start: string; end: string } {
  if (series.length === 0) return { start: "", end: "" };
  const start = formatRelativeAgo(series[0].t);
  const lastT = series[series.length - 1].t;
  const end = Date.now() - lastT < 120_000 ? "now" : formatRelativeAgo(lastT);
  return { start, end };
}

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

function requestLogDownload(deviceId: string, range: HistoryRange) {
  lastRequestedAt.set(`${deviceId}:${range}`, Date.now());
  const now = Date.now();
  sendCommand(deviceId, "start_log_download", {
    from_ts: toDeviceTs(now - RANGE_WINDOW_MS[range]),
    to_ts: toDeviceTs(now),
  });
}

/**
 * Requests the firmware's flash log for `range` (throttled per
 * deviceId+range) and returns the parsed entries, a `loading` flag for the
 * very first fetch, live download progress, and a `refresh()` escape hatch
 * that bypasses the throttle — e.g. for an explicit "Load history" button,
 * since the automatic fetch alone has turned out to not always be enough:
 * if the device only just reconnected, or the app was merely resumed from
 * the background (Capacitor can keep the WebView — and this module's
 * throttle map — alive across a "restart" that isn't actually a fresh
 * process), the 60s throttle can suppress the very fetch the user is
 * waiting on, leaving charts showing only this session's live buffer.
 */
export function useHistoryLog(deviceId: string | undefined, online: boolean, range: HistoryRange) {
  const entries = useLogs(deviceId);
  const progress = useLogProgress(deviceId);

  useEffect(() => {
    if (!deviceId || !online) return;
    const key = `${deviceId}:${range}`;
    const last = lastRequestedAt.get(key) ?? 0;
    if (Date.now() - last < MIN_REFETCH_INTERVAL_MS) return;
    requestLogDownload(deviceId, range);
  }, [deviceId, online, range]);

  const downloading = progress != null && progress.completedAt == null && !progress.cancelled;
  const loading = entries.length === 0 && downloading;
  const progressPct =
    downloading && progress.total > 0 ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : null;

  function refresh() {
    if (!deviceId || !online) return;
    requestLogDownload(deviceId, range);
  }

  return { entries, loading, downloading, progressPct, refresh };
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
