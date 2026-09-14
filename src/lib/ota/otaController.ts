// OTA session controller.
//
// Bridges the UI and the low-level `store.runOtaUpdate` engine:
//  - fetches the firmware manifest and downloads the .bin,
//  - drives a single global OTA session (one device at a time),
//  - exposes progress via a `useSyncExternalStore`-style hook so a dialog can
//    render live progress from anywhere in the tree.
//
// The transfer itself (reboot → reconnect to loader → stream → confirm) lives
// in `store.runOtaUpdate`. See docs/ota_app_integration_patch.md.

import { useSyncExternalStore } from "react";
import { store, type OtaPhase } from "../device/store";
import { fetchFirmwareManifest, type FirmwareRelease } from "./updateCheck";
import { firmwareFetch } from "./firmwareSource";

export interface OtaSession {
  /** Whether an update is currently in progress (dialog should be shown). */
  active: boolean;
  deviceId: string | null;
  deviceName: string | null;
  /** Target firmware version from the manifest. */
  version: string | null;
  phase: OtaPhase | "idle" | "error";
  /** Optional human-readable detail for the current phase. */
  detail: string | null;
  sent: number;
  total: number;
  /** Set when the session failed. */
  error: string | null;
  /** True once the device has accepted the image and is rebooting. */
  succeeded: boolean;
}

const IDLE: OtaSession = {
  active: false,
  deviceId: null,
  deviceName: null,
  version: null,
  phase: "idle",
  detail: null,
  sent: 0,
  total: 0,
  error: null,
  succeeded: false,
};

let state: OtaSession = IDLE;
const subs = new Set<() => void>();
let abort: AbortController | null = null;

function set(patch: Partial<OtaSession>) {
  state = { ...state, ...patch };
  subs.forEach((cb) => cb());
}

function subscribe(cb: () => void) {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

function getSnapshot() {
  return state;
}

/** Live OTA session state for the progress dialog. */
export function useOtaState(): OtaSession {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Per-device OTA status as a stable primitive so a device card only
 *  re-renders when *its* status flips — NOT on every progress tick. */
export function useOtaDeviceStatus(deviceId: string): "this" | "other" | "idle" {
  return useSyncExternalStore(
    subscribe,
    () => (state.active ? (state.deviceId === deviceId ? "this" : "other") : "idle"),
    () => "idle",
  );
}

/** Read the current session imperatively (e.g. to guard concurrent starts). */
export function getOtaState(): OtaSession {
  return state;
}

/** Begin an OTA update for a device. Resolves when the transfer finishes
 *  (successfully or not); UI observes progress via {@link useOtaState}.
 *
 *  Pass `{ recover: true }` to resume a device that is already stuck in the OTA
 *  loader (offline in the app): this skips the reboot step and reconnects
 *  straight to the loader. Use it to rescue a device whose previous update was
 *  interrupted — even after an app restart, when the in-memory loader flag is
 *  gone.
 *
 *  Pass `{ release }` to flash a SPECIFIC firmware version (from the catalog),
 *  including an OLDER one to roll a device back to a known-good build. When
 *  omitted, the latest manifest (latest.json) is used. */
export async function startOta(
  deviceId: string,
  deviceName?: string,
  opts?: { recover?: boolean; release?: FirmwareRelease },
): Promise<void> {
  if (state.active) throw new Error("an update is already in progress");

  abort = new AbortController();
  set({
    ...IDLE,
    active: true,
    deviceId,
    deviceName: deviceName ?? deviceId,
    version: opts?.release?.version ?? null,
    phase: opts?.recover ? "reconnect" : "reboot",
    detail: opts?.recover ? "looking for device in updater" : "preparing update",
  });

  try {
    // 1. Resolve the image to flash — an explicitly chosen release, or the
    //    latest published manifest when none was given.
    const target: FirmwareRelease = opts?.release ?? (await fetchFirmwareManifest());
    set({ version: target.version, detail: "downloading firmware" });

    const res = await firmwareFetch(target.url, { cache: "no-store", signal: abort.signal });
    if (!res.ok) {
      throw new Error(`firmware download failed: ${res.status} ${res.statusText}`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());

    // 2. Hand off to the BLE engine. Throttle progress to whole-percent steps
    //    so the dialog (and its subscribers) don't re-render on every 240B chunk.
    let lastPct = -1;
    await store.runOtaUpdate(
      deviceId,
      buf,
      {
        phase: (phase, detail) => set({ phase, detail: detail ?? null }),
        progress: (sent, total) => {
          const pct = total > 0 ? Math.floor((sent / total) * 100) : 0;
          if (pct !== lastPct || sent >= total) {
            lastPct = pct;
            set({ sent, total });
          }
        },
      },
      abort.signal,
      { forceResume: opts?.recover === true },
    );

    set({ phase: "done", succeeded: true, detail: "device rebooting into new firmware" });
  } catch (e) {
    set({
      phase: "error",
      error: e instanceof Error ? e.message : String(e),
    });
  } finally {
    abort = null;
  }
}

/** Abort the in-flight update (best-effort). */
export function cancelOta() {
  abort?.abort();
}

/** Dismiss a finished/failed session and reset to idle. */
export function dismissOta() {
  if (abort) return; // still running; use cancelOta first
  state = IDLE;
  subs.forEach((cb) => cb());
}
