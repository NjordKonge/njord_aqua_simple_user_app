/**
 * Water source — maps directly onto the real firmware config field
 * `water_src` (BLE_DEVELOPER_GUIDE.md §7: "Water source code", 1-5, SETCFG-
 * validated). The firmware does not document which number means which
 * source, so this ordinal mapping is an app-side assumption pending
 * PM/firmware confirmation — it is NOT invented data, but the code->label
 * assignment specifically should be verified before shipping.
 */
import type { NjordConfig } from "./types";
import { updateConfig } from "./store";

export type WaterSource = "borehole" | "rainwater" | "municipal_surface" | "municipal_borehole";

const CODE_TO_SOURCE: Record<number, WaterSource> = {
  1: "borehole",
  2: "rainwater",
  3: "municipal_surface",
  4: "municipal_borehole",
};
const SOURCE_TO_CODE: Record<WaterSource, number> = {
  borehole: 1,
  rainwater: 2,
  municipal_surface: 3,
  municipal_borehole: 4,
};

export const WATER_SOURCE_LABEL: Record<WaterSource, string> = {
  borehole: "Borehole",
  rainwater: "Rainwater",
  municipal_surface: "Municipal (surface water)",
  municipal_borehole: "Municipal (borehole)",
};

export function waterSourceFromConfig(config: NjordConfig | undefined): WaterSource | null {
  if (!config) return null;
  return CODE_TO_SOURCE[config.water_src] ?? null;
}

export function setWaterSource(deviceId: string, source: WaterSource) {
  return updateConfig(deviceId, { water_src: SOURCE_TO_CODE[source] });
}
