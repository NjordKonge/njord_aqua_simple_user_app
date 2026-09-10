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
 * `useHistoryLog` exposes a `refresh()` that triggers a ranged
 * `start_log_download` (STARTLOGDL with from_ts/to_ts) for the selected
 * range and reads the parsed result back from the store's `logs[deviceId]`
 * (populated by store.ts's LogData chunk reassembly). Downloads only ever
 * happen when `refresh()` is called explicitly (e.g. the "Load history"
 * button) — there is deliberately no automatic fetch on mount/range change,
 * so opening the Overview screen never itself triggers a BLE transfer.
 *
 * Two independent failure modes are surfaced via `error`:
 *  - The STARTLOGDL command itself can fail fast (device not connected,
 *    malformed request) or never get acknowledged at all (5 s response
 *    timeout in store.ts's `sendCommand`) — reflected in the returned
 *    `CommandEntry`'s `status`/`error`.
 *  - The command can be ack'd fine but the chunked transfer that follows
 *    can then stall (BLE glitch, firmware hiccup) or the link can drop —
 *    reflected in `logProgress[id].cancelled`/`.error` (see store.ts's
 *    watchdog `LOG_STALL_MS` check and `abortInFlightLogProgress`).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { NJORD_EPOCH_OFFSET } from "./types";
import type { LogEntry, TelemetryLogEntry, TelemetrySample, SonarLogEntry, CommandEntry } from "./types";
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

/** A single labeled position along a chart's x-axis. `frac` is 0..1 along
 *  the plotted time span (0 = oldest sample, 1 = newest) — the caller
 *  positions it linearly (`frac * plotWidth`) so ticks always line up with
 *  where that instant actually falls on the (time-linear) x-axis, rather
 *  than being spaced evenly by sample index. */
export interface ChartTick {
  frac: number;
  label: string;
}

/** Evenly-time-spaced x-axis tick labels (start, `count - 2` intermediate
 *  points, end) for a chart series, derived from the samples actually being
 *  drawn (not the requested range) so they can never claim the chart
 *  reaches further back — or more recent — than it really does. Each tick's
 *  label reflects the exact interpolated instant at its position, so the
 *  labels stay honest about the (linear) time axis even when samples
 *  themselves are unevenly spaced. */
export function chartAxisTicks(series: Array<{ t: number }>, count = 4): ChartTick[] {
  if (series.length === 0) return [];
  const tMin = series[0].t;
  const tMax = series[series.length - 1].t;
  const span = tMax - tMin;
  const n = Math.max(2, count);
  return Array.from({ length: n }, (_, i) => {
    const frac = i / (n - 1);
    const t = tMin + frac * span;
    const label = frac === 1 && Date.now() - t < 120_000 ? "now" : formatRelativeAgo(t);
    return { frac, label };
  });
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

function requestLogDownload(deviceId: string, range: HistoryRange): CommandEntry {
  const now = Date.now();
  return sendCommand(deviceId, "start_log_download", {
    from_ts: toDeviceTs(now - RANGE_WINDOW_MS[range]),
    to_ts: toDeviceTs(now),
  });
}

export interface HistoryDownloadResult {
  status: "success" | "error";
  message: string;
}

/**
 * Exposes the firmware's flash log for `range`, downloaded ONLY when
 * `refresh()` is called explicitly (e.g. the "Load history" button) — never
 * automatically on mount or range change. Also surfaces:
 *  - `downloading`/`progressPct` — live chunk-transfer progress.
 *  - `result` — the outcome of the most recently *completed* request
 *    (`{status:"success", message:"Log downloaded successfully"}` or
 *    `{status:"error", message:"<reason>"}`), so the UI can show a
 *    transient confirmation/error banner; call `dismissResult()` to clear it
 *    (e.g. after an auto-dismiss timer).
 *  - `latestEntryAt` — host-ms timestamp of the newest record currently held
 *    in `entries` (from the last successful download), so the UI can show
 *    "Latest data: 2h ago" before the user decides whether to download again.
 */
export function useHistoryLog(deviceId: string | undefined, online: boolean, range: HistoryRange) {
  const entries = useLogs(deviceId);
  const progress = useLogProgress(deviceId);
  const ackRef = useRef<CommandEntry | null>(null);
  const [result, setResult] = useState<HistoryDownloadResult | null>(null);
  const seenRef = useRef<{ ackUid?: string; completedAt?: number }>({});

  // Ack-level failure: device not connected, malformed command, or no
  // response within 5s (store.ts's `sendCommand` timeout). This never
  // touches `logProgress` at all, so without watching the CommandEntry
  // directly a failed ack used to fail completely silently.
  useEffect(() => {
    const ack = ackRef.current;
    if (ack && ack.status === "error" && seenRef.current.ackUid !== ack.uid) {
      seenRef.current.ackUid = ack.uid;
      setResult({ status: "error", message: ack.error ?? "Download failed" });
    }
  });

  // Transfer-level outcome: the ack succeeded but the chunked transfer then
  // completed, stalled (store.ts's watchdog `LOG_STALL_MS` check), or the
  // link dropped mid-transfer (`abortInFlightLogProgress`).
  useEffect(() => {
    if (progress && progress.completedAt != null && seenRef.current.completedAt !== progress.completedAt) {
      seenRef.current.completedAt = progress.completedAt;
      if (progress.cancelled) {
        setResult({ status: "error", message: progress.error ?? "Download cancelled" });
      } else {
        setResult({ status: "success", message: "Log downloaded successfully" });
      }
    }
  }, [progress]);

  const downloading =
    ackRef.current?.status === "pending" ||
    (progress != null && progress.completedAt == null && !progress.cancelled);
  const progressPct =
    downloading && progress && progress.total > 0
      ? Math.min(100, Math.round((progress.received / progress.total) * 100))
      : null;
  const latestEntryAt = entries.reduce((max, e) => Math.max(max, fromDeviceTs(e.ts)), 0) || null;

  function refresh() {
    if (!deviceId || !online) return;
    ackRef.current = requestLogDownload(deviceId, range);
  }

  function dismissResult() {
    setResult(null);
  }

  return { entries, downloading, progressPct, result, dismissResult, latestEntryAt, refresh };
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
