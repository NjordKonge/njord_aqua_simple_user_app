/**
 * Treatment-progress semantics.
 *
 * Converts delivered/target charge and the firmware's authoritative phase
 * clock into a percentage and a human "time remaining" string.
 *
 * `phase_elapsed_ms` / `phase_total_ms` are device-side counters — preferred
 * over host timers to avoid drift (see LiveStatus docs in ./types).
 */
import type { LiveStatus } from "./types";

export interface ProgressSummary {
  active: boolean;
  /** 0..100, or null when there is no meaningful target. */
  percent: number | null;
  /** "Treating" / "Resting" / "Waiting" in user language. */
  phaseLabel: string;
  /** Remaining time in the current phase, ms. null when unknown. */
  phaseRemainingMs: number | null;
  /** Pre-formatted, e.g. "about 5 minutes left". null when unknown. */
  remainingLabel: string | null;
}

const PHASE_LABEL: Record<string, string> = {
  ON: "Treating",
  REST: "Resting",
  WAIT: "Waiting",
};

/** Rounds to a friendly, non-jittery duration string. */
export function formatRemaining(ms: number): string {
  if (ms < 60_000) return "less than a minute left";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? "" : "s"} left`;
  const hours = Math.round(minutes / 60);
  return `about ${hours} hour${hours === 1 ? "" : "s"} left`;
}

export function summarizeProgress(status: LiveStatus): ProgressSummary {
  const active = status.state === "ELECTROLYSIS_ACTIVE";

  const percent =
    status.target_uc > 0
      ? Math.min(100, Math.round((status.deliv_uc / status.target_uc) * 100))
      : null;

  const hasPhaseClock = active && status.phase_total_ms > 0;
  const phaseRemainingMs = hasPhaseClock
    ? Math.max(0, status.phase_total_ms - status.phase_elapsed_ms)
    : null;

  return {
    active,
    percent,
    phaseLabel: PHASE_LABEL[status.phase] ?? (active ? "Treating" : "Idle"),
    phaseRemainingMs,
    remainingLabel: phaseRemainingMs === null ? null : formatRemaining(phaseRemainingMs),
  };
}
