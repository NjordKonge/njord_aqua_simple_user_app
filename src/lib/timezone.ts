import { useSyncExternalStore } from "react";

const KEY = "njord.tz";
const EVT = "njord-tz-change";

export const COMMON_TIMEZONES: string[] = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Stockholm",
  "Europe/Helsinki",
  "Europe/Athens",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
];

function read(): string {
  if (typeof window === "undefined") return "UTC";
  return window.localStorage.getItem(KEY) ?? "UTC";
}

export function getTimezone(): string {
  return read();
}

export function setTimezone(tz: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, tz);
  window.dispatchEvent(new Event(EVT));
}

export function detectLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useTimezone(): string {
  return useSyncExternalStore(subscribe, read, () => "UTC");
}

/** Short label like "UTC" or "CET" / "+02:00" for the chosen tz. */
export function timezoneAbbr(tz: string, at = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(at);
    const name = parts.find((p) => p.type === "timeZoneName")?.value;
    return name ?? tz;
  } catch {
    return tz;
  }
}