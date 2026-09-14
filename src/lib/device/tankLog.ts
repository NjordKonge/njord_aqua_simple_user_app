/**
 * Local (phone-side) tank fill-level log + derived "water used" figure.
 *
 * The firmware has no flow sensor, so there is no real litres-consumed
 * field (see lib/device/waterStatus.ts's doc comment on the same gap).
 * This reconstructs a rough figure instead: Home logs the sonar-derived
 * fill level (see lib/device/tank.ts) on a timer while the device is
 * connected (TANK_REFRESH_MS in routes/index.tsx), and `useTankUsage` sums
 * only the DROPS between consecutive samples — a rise is a refill, not
 * negative usage. Persisted to localStorage per device (capped, see
 * USAGE_WINDOW_MS/MAX_SAMPLES) so the figure survives closing the app.
 */
import { useSyncExternalStore } from "react";

const STORAGE_PREFIX = "njord.tankLog.";

/** Only samples within this trailing window count toward "water used". */
export const USAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Hard cap on stored samples regardless of time span, so a device left
 *  logging for a very long stretch can't grow the log unboundedly. At the
 *  5 s cadence Home logs on, this covers well over the 24 h usage window. */
const MAX_SAMPLES = 20_000;

interface Sample {
  ts: number;
  liters: number;
}

export interface TankUsageSummary {
  /** Litres consumed within the log window (sum of drops only); null until
   *  at least two samples have been logged. */
  usedLiters: number | null;
  /** Actual span covered by the log, ms (<= USAGE_WINDOW_MS). */
  windowMs: number;
}

const EMPTY_USAGE: TankUsageSummary = { usedLiters: null, windowMs: 0 };

const logs = new Map<string, Sample[]>();
const usageCache = new Map<string, TankUsageSummary>();
const listeners = new Map<string, Set<() => void>>();

function storageKey(deviceId: string): string {
  return STORAGE_PREFIX + deviceId;
}

function load(deviceId: string): Sample[] {
  const cached = logs.get(deviceId);
  if (cached) return cached;
  let out: Sample[] = [];
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(storageKey(deviceId));
      if (raw) out = JSON.parse(raw) as Sample[];
    } catch {
      out = [];
    }
  }
  logs.set(deviceId, out);
  return out;
}

function persist(deviceId: string, samples: Sample[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(deviceId), JSON.stringify(samples));
  } catch {
    // Storage quota exceeded or unavailable — the in-memory log still works
    // for this session, it just won't survive an app restart.
  }
}

function computeUsage(samples: Sample[]): TankUsageSummary {
  if (samples.length < 2) return EMPTY_USAGE;
  let used = 0;
  for (let i = 1; i < samples.length; i++) {
    const drop = samples[i - 1].liters - samples[i].liters;
    if (drop > 0) used += drop;
  }
  return {
    usedLiters: Math.round(used * 10) / 10,
    windowMs: samples[samples.length - 1].ts - samples[0].ts,
  };
}

function notify(deviceId: string) {
  for (const l of listeners.get(deviceId) ?? []) l();
}

/** Append a fill-level reading (litres) for a device. Called on Home's tank
 *  refresh timer once a sonar-derived reading is known. */
export function logTankLevel(deviceId: string, liters: number, ts: number = Date.now()) {
  const samples = load(deviceId).slice();
  samples.push({ ts, liters });
  const cutoff = ts - USAGE_WINDOW_MS;
  let pruned = samples.filter((s) => s.ts >= cutoff);
  if (pruned.length > MAX_SAMPLES) pruned = pruned.slice(pruned.length - MAX_SAMPLES);
  logs.set(deviceId, pruned);
  usageCache.set(deviceId, computeUsage(pruned));
  persist(deviceId, pruned);
  notify(deviceId);
}

export function useTankUsage(deviceId: string | undefined): TankUsageSummary {
  return useSyncExternalStore(
    (onChange) => {
      if (!deviceId) return () => {};
      let set = listeners.get(deviceId);
      if (!set) {
        set = new Set();
        listeners.set(deviceId, set);
      }
      set.add(onChange);
      return () => set!.delete(onChange);
    },
    () => {
      if (!deviceId) return EMPTY_USAGE;
      const cached = usageCache.get(deviceId);
      if (cached) return cached;
      const computed = computeUsage(load(deviceId));
      usageCache.set(deviceId, computed);
      return computed;
    },
    () => EMPTY_USAGE,
  );
}
