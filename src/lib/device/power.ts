/**
 * Electrode power (watts) — derived, not a firmware field.
 *
 * The firmware has a real current sensor for the electrode (`elec_ma`, a
 * genuine ADC/shunt reading — see BLE_DEVELOPER_GUIDE.md §6) but no
 * dedicated voltage sensor across the electrode itself; it only measures
 * the board's supply/battery/solar rail voltages. The electrode is driven
 * by a PWM H-bridge off the supply rail, so the actual (time-averaged)
 * voltage the electrode sees is the supply rail voltage scaled by the
 * H-bridge's duty cycle — both of which ARE real device values:
 *   elec_mv = cruise_duty_pm (‰, real PWM duty the firmware is driving) *
 *             supply_mv (mV, real ADC-measured supply rail) / 1000
 *   watts   = (elec_mv / 1000) * (elec_ma / 1000)
 * This is the standard way to get the effective voltage across a
 * PWM-driven resistive/electrolytic load without an extra ADC channel, and
 * is as accurate as the hardware allows — there is no more "raw" voltage
 * reading to fall back to.
 *
 * Historical value: TelemetrySample (used for the 48h charts) does NOT
 * carry elec_mv, only cruise_duty_pm + supply_mv, so the same formula is
 * reapplied from those two fields.
 */
import type { LiveStatus, TelemetrySample } from "./types";

export function wattsFromStatus(status: LiveStatus): number {
  return (status.elec_mv / 1000) * (status.elec_ma / 1000);
}

export function voltsFromStatus(status: LiveStatus): number {
  return status.elec_mv / 1000;
}

export function voltsFromTelemetry(sample: TelemetrySample): number {
  const elecMv = (sample.cruise_duty_pm / 1000) * sample.supply_mv;
  return elecMv / 1000;
}

export function wattsFromTelemetry(sample: TelemetrySample): number {
  return voltsFromTelemetry(sample) * (sample.elec_ma / 1000);
}
