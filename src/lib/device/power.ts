/**
 * Electrode power (watts) — derived, not a firmware field.
 *
 * Live value: LiveStatus already carries `elec_mv` (API v2.3 field 11,
 * `cruise_duty_pm * supply_mv / 1000`, see ./types) alongside `elec_ma`.
 *   watts = (elec_mv / 1000) * (elec_ma / 1000)
 *
 * Historical value: TelemetrySample (used for the 48h chart) does NOT carry
 * elec_mv, only cruise_duty_pm + supply_mv, so the same voltage formula is
 * reapplied from those fields — this mirrors the documented elec_mv formula,
 * it does not invent a new one.
 */
import type { LiveStatus, TelemetrySample } from "./types";

export function wattsFromStatus(status: LiveStatus): number {
  return (status.elec_mv / 1000) * (status.elec_ma / 1000);
}

export function wattsFromTelemetry(sample: TelemetrySample): number {
  const elecMv = (sample.cruise_duty_pm / 1000) * sample.supply_mv;
  return (elecMv / 1000) * (sample.elec_ma / 1000);
}
