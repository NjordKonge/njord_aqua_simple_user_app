/**
 * "Pre-chlorination of incoming water" — maps onto the real firmware config
 * field `chloride_mg_l` (BLE_DEVELOPER_GUIDE.md §7: "Current chloride
 * concentration estimate (mg/L)"). The field's description matches the
 * spec's intent exactly: telling the device how much chlorine/chloride is
 * already present in incoming water so it can adjust dosing accordingly.
 *
 * The firmware's own validation range is 0-10000 mg/L (very permissive);
 * the UI restricts input to the spec's 0-5 mg/L / 0.5 steps, which is a
 * strict subset of the valid range, not a new constraint on the device.
 */
import type { NjordConfig } from "./types";
import { updateConfig } from "./store";

export const PRECHLORINATION_MIN_MG_L = 0;
export const PRECHLORINATION_MAX_MG_L = 5;
export const PRECHLORINATION_STEP_MG_L = 0.5;

export function prechlorinationFromConfig(config: NjordConfig | undefined): number {
  if (!config) return 0;
  return Math.max(
    PRECHLORINATION_MIN_MG_L,
    Math.min(PRECHLORINATION_MAX_MG_L, config.chloride_mg_l),
  );
}

export function setPrechlorination(deviceId: string, mgPerL: number) {
  return updateConfig(deviceId, { chloride_mg_l: mgPerL });
}
