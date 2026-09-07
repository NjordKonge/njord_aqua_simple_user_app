/**
 * "Water status" (safe / not_yet_safe / error) — the spec's central concept
 * for the Home status row.
 *
 * IMPORTANT — this is a best-effort PROXY, not a firmware feature:
 * the firmware has no "water is safe to use" signal and no ETA
 * (`waterSafeAgainAt` in the spec's data model). What it does have:
 *   - `fault`                — hard fault codes (see ./status.ts)
 *   - `debt_removal_active`  — true while the device is running extra
 *                              cycles to catch up on a chlorine shortfall
 *                              (API v2.4 `charge_debt_c`, see ./types)
 * `debt_removal_active` is used as the "not yet safe, catching up" signal
 * because it is the closest real concept to "dosing hasn't reached target
 * yet". There is no data to compute a "safe again at" time, so that value
 * is always null — this needs a PM/firmware decision (see the spec's own
 * open question about whether an ETA is always available).
 */
import type { Device } from "./types";
import type { Tone } from "./status";

export type WaterStatus = "safe" | "not_yet_safe" | "error" | "unknown";

export interface WaterStatusSummary {
  status: WaterStatus;
  tone: Tone;
  label: string;
  message: string;
  /** Always null — see module doc. Kept in the shape for forward-compat. */
  safeAgainAt: number | null;
}

export function summarizeWaterStatus(device: Device | undefined): WaterStatusSummary {
  if (!device || !device.online) {
    return {
      status: "unknown",
      tone: "info",
      label: "Unknown",
      message: "Connect the device to see water status.",
      safeAgainAt: null,
    };
  }

  const { fault, debt_removal_active } = device.status;

  if (fault && fault !== "NONE") {
    return {
      status: "error",
      tone: "bad",
      label: "Needs attention",
      message: `Device fault: ${fault.replace(/_/g, " ").toLowerCase()}.`,
      safeAgainAt: null,
    };
  }

  if (debt_removal_active) {
    return {
      status: "not_yet_safe",
      tone: "warn",
      label: "Not yet safe",
      message: "Catching up on treatment — check back soon.",
      safeAgainAt: null,
    };
  }

  return {
    status: "safe",
    tone: "good",
    label: "Safe to use",
    message: "Fully disinfected, safe to use.",
    safeAgainAt: null,
  };
}
