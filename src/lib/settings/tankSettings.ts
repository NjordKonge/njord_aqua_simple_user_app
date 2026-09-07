/**
 * Purely local, phone-only settings that have NO firmware representation.
 *
 * `tankModel` (brand name) is not a config field on the device — there is no
 * SETCFG key for it. It is stored here only so the Settings screen can
 * remember the user's selection; it is never sent over BLE. If tank presets
 * per brand are wanted later, this is the place to map a brand to a
 * suggested `tank_l` / `tank_max_mm` pair for the user to confirm.
 */
import { useSyncExternalStore } from "react";

export type TankModel = "sintex" | "vectus" | "pallet_tank" | "ashirvad";

const STORAGE_KEY = "njord.settings.tankModel";

let tankModel: TankModel | null = readInitial();
const listeners = new Set<() => void>();

function readInitial(): TankModel | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "sintex" || raw === "vectus" || raw === "pallet_tank" || raw === "ashirvad"
    ? raw
    : null;
}

function notify() {
  for (const l of listeners) l();
}

export function setTankModel(model: TankModel) {
  tankModel = model;
  localStorage.setItem(STORAGE_KEY, model);
  notify();
}

export function useTankModel(): TankModel | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => tankModel,
  );
}

export const TANK_MODEL_LABEL: Record<TankModel, string> = {
  sintex: "Sintex",
  vectus: "Vectus",
  pallet_tank: "Pallet tank",
  ashirvad: "Ashirvad",
};
