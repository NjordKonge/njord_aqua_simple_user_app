/**
 * Power + environment semantics (battery, power source, water temperature).
 *
 * Thresholds are taken from the firmware, which must not change:
 *   Solar_and_BMS.cpp   CHG_V_ABSORPTION_MV 14400, CHG_V_FLOAT_MV 13600,
 *                       CHG_V_RECHARGE_MV 12600, CHG_V_BAT_MIN_MV 8000
 *   HardwareStatus.cpp  BATTERY_CONNECTED_MIN_MV 8000 / MAX 24000,
 *                       SUPPLY_CONNECTED_MIN_MV 5000
 * The pack is a 12 V lead-acid battery.
 */
import type { LiveStatus } from "./types";
import type { Tone } from "./status";

/** Thermistor open/short sentinel — mirrors TEMP_SENTINEL in ./store. */
export const TEMP_SENTINEL = -32768;

/** Firmware-derived limits (mV). Do not diverge from the constants above. */
export const BATTERY_CONNECTED_MIN_MV = 8000;
export const BATTERY_CONNECTED_MAX_MV = 24000;
export const SUPPLY_CONNECTED_MIN_MV = 5000;

/**
 * Resting state-of-charge curve for a 12 V lead-acid battery.
 *
 * NOTE: this is only meaningful at rest. While charging, the pack sits at the
 * absorption/float target (13.6–14.4 V) and will read as full regardless of
 * true charge, which is why `charging` is reported separately below.
 */
const SOC_CURVE: Array<{ mv: number; pct: number }> = [
  { mv: 11800, pct: 0 },
  { mv: 12000, pct: 25 },
  { mv: 12200, pct: 50 },
  { mv: 12400, pct: 75 },
  { mv: 12700, pct: 100 },
];

/** Linear interpolation across SOC_CURVE. Returns null when disconnected. */
export function batteryPercent(mv: number): number | null {
  if (mv < BATTERY_CONNECTED_MIN_MV || mv > BATTERY_CONNECTED_MAX_MV) return null;

  const first = SOC_CURVE[0];
  const last = SOC_CURVE[SOC_CURVE.length - 1];
  if (mv <= first.mv) return 0;
  if (mv >= last.mv) return 100;

  for (let i = 1; i < SOC_CURVE.length; i++) {
    const hi = SOC_CURVE[i];
    const lo = SOC_CURVE[i - 1];
    if (mv <= hi.mv) {
      const span = hi.mv - lo.mv;
      const ratio = span === 0 ? 0 : (mv - lo.mv) / span;
      return Math.round(lo.pct + ratio * (hi.pct - lo.pct));
    }
  }
  return 100;
}

export type PowerSource = "solar" | "external" | "battery" | "unknown";

export interface BatterySummary {
  connected: boolean;
  /** null when disconnected, or while the reading is not trustworthy. */
  percent: number | null;
  charging: boolean;
  tone: Tone;
  /** Plain-language line, e.g. "Charging from solar". */
  label: string;
}

export interface TemperatureSummary {
  /** null when the thermistor is disconnected (warning only in firmware). */
  celsius: number | null;
  available: boolean;
}

export interface HealthSummary {
  battery: BatterySummary;
  source: PowerSource;
  temperature: TemperatureSummary;
}

function batteryTone(percent: number | null, charging: boolean): Tone {
  if (percent === null) return "warn";
  if (charging) return "good";
  if (percent <= 20) return "bad";
  if (percent <= 40) return "warn";
  return "good";
}

export function powerSource(status: LiveStatus): PowerSource {
  if (status.solar_conn && status.solar_chg_on) return "solar";
  // No dedicated "supply connected" flag exists (only `supply_ok`, a
  // hardware-status flag, and `supply_mv`) — mirror the voltage-threshold
  // approach already used for the battery via SUPPLY_CONNECTED_MIN_MV.
  if (status.supply_mv >= SUPPLY_CONNECTED_MIN_MV) return "external";
  if (status.batt_conn) return "battery";
  return "unknown";
}

export function summarizeHealth(status: LiveStatus): HealthSummary {
  const connected =
    status.batt_conn &&
    status.batt_mv >= BATTERY_CONNECTED_MIN_MV &&
    status.batt_mv <= BATTERY_CONNECTED_MAX_MV;

  const charging = status.solar_chg_on;
  const percent = connected ? batteryPercent(status.batt_mv) : null;
  const source = powerSource(status);

  let label: string;
  if (!connected) label = "No battery detected";
  else if (charging) label = source === "solar" ? "Charging from solar" : "Charging";
  else if (percent !== null) label = `${percent}% battery`;
  else label = "Battery connected";

  return {
    battery: {
      connected,
      percent,
      charging,
      tone: connected ? batteryTone(percent, charging) : "warn",
      label,
    },
    source,
    temperature: {
      celsius: status.temp_c === TEMP_SENTINEL ? null : status.temp_c,
      available: status.temp_c !== TEMP_SENTINEL,
    },
  };
}
