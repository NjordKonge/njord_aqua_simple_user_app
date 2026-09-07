/**
 * Connection + operating-state semantics.
 *
 * Turns the raw firmware `state` / `fault` strings into a single plain-language
 * headline an end user can act on. All wording lives here (not in JSX) so the
 * product voice stays consistent across every screen.
 *
 * Firmware reference (read-only): DeviceStateName / FaultName in ./types.
 */
import type { Device } from "./types";

export type Tone = "good" | "info" | "warn" | "bad";

export type ConnectionState = "connected" | "reconnecting" | "offline";

export interface StatusSummary {
  connection: ConnectionState;
  tone: Tone;
  /** Short, user-facing sentence. Never a raw firmware code. */
  headline: string;
  /** Optional supporting line explaining what happens next. */
  detail?: string;
  /** True when the user is expected to do something. */
  needsAttention: boolean;
}

/**
 * User-facing wording for each fault code.
 *
 * Severity mirrors the technical app's `severityForFault`, but the copy is
 * rewritten for a non-technical reader: what happened, and whether the device
 * will fix it by itself.
 */
const FAULT_COPY: Record<string, { headline: string; detail: string; tone: Tone }> = {
  HARDWARE_FAULT: {
    headline: "Hardware issue detected",
    detail: "The device will recover automatically once the issue clears.",
    tone: "warn",
  },
  OVERCURRENT: {
    headline: "Treatment paused",
    detail: "Too much current was drawn. The device retries automatically.",
    tone: "bad",
  },
  ELECTRODE_OPEN: {
    headline: "Check the electrode",
    detail: "No connection to the electrode. The device retries automatically.",
    tone: "warn",
  },
};

export function summarizeStatus(device: Device | undefined): StatusSummary {
  if (!device) {
    return {
      connection: "offline",
      tone: "info",
      headline: "No device connected",
      detail: "Connect your Njord Aqua to get started.",
      needsAttention: false,
    };
  }

  if (!device.online) {
    return {
      connection: device.reconnecting ? "reconnecting" : "offline",
      tone: device.reconnecting ? "info" : "warn",
      headline: device.reconnecting ? "Reconnecting…" : "Device offline",
      detail: device.reconnecting
        ? "Keep your phone near the device."
        : "Move closer to the device, or check that it has power.",
      needsAttention: !device.reconnecting,
    };
  }

  const { fault, state } = device.status;

  if (fault && fault !== "NONE") {
    const copy = FAULT_COPY[fault];
    return {
      connection: "connected",
      tone: copy?.tone ?? "warn",
      headline: copy?.headline ?? "Needs attention",
      detail: copy?.detail,
      needsAttention: true,
    };
  }

  switch (state) {
    case "ELECTROLYSIS_ACTIVE":
      return {
        connection: "connected",
        tone: "good",
        headline: "Treating water",
        needsAttention: false,
      };
    case "IDLE":
      return {
        connection: "connected",
        tone: "good",
        headline: "Ready",
        detail: "Not currently treating.",
        needsAttention: false,
      };
    case "BOOT":
      return {
        connection: "connected",
        tone: "info",
        headline: "Starting up…",
        needsAttention: false,
      };
    case "ERROR":
      return {
        connection: "connected",
        tone: "bad",
        headline: "Needs attention",
        detail: "The device stopped and needs to be reset.",
        needsAttention: true,
      };
    default:
      return {
        connection: "connected",
        tone: "info",
        headline: "Connected",
        needsAttention: false,
      };
  }
}
