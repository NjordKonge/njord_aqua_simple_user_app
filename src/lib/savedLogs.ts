// Saved-logs registry — persists every completed flash-log download so the user
// can rename it and re-export later. Backed by localStorage (Capacitor's
// Android WebView exposes the standard Web Storage API, so the same code runs
// natively and on the web build).
//
// Stored payload is the CSV text the user would otherwise have downloaded
// immediately. Re-export feeds it through downloadTextFile() (which uses the
// Filesystem + Share plugins on native).

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "njord.savedLogs.v1";

export interface SavedLog {
  /** Stable random id used as React key + delete handle. */
  id: string;
  /** Device the download came from. */
  deviceId: string;
  /** User-facing name — defaults to `<deviceId>-<ISO timestamp>` and is
   *  editable via renameSavedLog(). */
  name: string;
  /** Host-side ms timestamp at archival. */
  savedAt: number;
  /** Number of decoded log entries (purely informational, for the list). */
  entryCount: number;
  /** Reassembled CSV text — the same payload `exportCsv()` would have built
   *  in-memory at download completion. */
  csv: string;
}

// ---- Internal store --------------------------------------------------------

const listeners = new Set<() => void>();
let cache: SavedLog[] | null = null;

function read(): SavedLog[] {
  if (cache !== null) return cache;
  try {
    const raw = typeof localStorage !== "undefined"
      ? localStorage.getItem(STORAGE_KEY)
      : null;
    if (!raw) { cache = []; return cache; }
    const parsed = JSON.parse(raw);
    cache = Array.isArray(parsed) ? parsed.filter(isValid) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function isValid(x: unknown): x is SavedLog {
  if (typeof x !== "object" || x == null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "string"
      && typeof o.deviceId === "string"
      && typeof o.name === "string"
      && typeof o.savedAt === "number"
      && typeof o.csv === "string";
}

function write(list: SavedLog[]): void {
  cache = list;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  } catch (err) {
    console.warn("savedLogs: persist failed", err);
  }
  for (const l of listeners) l();
}

function newId(): string {
  // crypto.randomUUID() is available in modern WebViews; fall back if absent.
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `sl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---- Public API ------------------------------------------------------------

export function listSavedLogs(): SavedLog[] {
  return [...read()].sort((a, b) => b.savedAt - a.savedAt);
}

/** Append a new entry. Returns the persisted record. */
export function archiveSavedLog(input: {
  deviceId: string;
  csv: string;
  entryCount: number;
  name?: string;
  /** User-defined device name suffix (API v2.12 SETNAME); when set it is
   *  prefixed to the auto-generated default name so archived logs are easy to
   *  tell apart per device. */
  nameSuffix?: string;
}): SavedLog {
  const savedAt = Date.now();
  const stamp = new Date(savedAt)
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const prefix = input.nameSuffix?.trim()
    ? `${input.nameSuffix.trim()}-${input.deviceId}`
    : input.deviceId;
  const defaultName = `${prefix}-${stamp}`;
  const rec: SavedLog = {
    id: newId(),
    deviceId: input.deviceId,
    name: (input.name?.trim() || defaultName).slice(0, 120),
    savedAt,
    entryCount: input.entryCount,
    csv: input.csv,
  };
  write([rec, ...read()]);
  return rec;
}

export function renameSavedLog(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const list = read().map((l) => (l.id === id ? { ...l, name: trimmed.slice(0, 120) } : l));
  write(list);
}

export function deleteSavedLog(id: string): void {
  write(read().filter((l) => l.id !== id));
}

export function getSavedLog(id: string): SavedLog | undefined {
  return read().find((l) => l.id === id);
}

// ---- React hook ------------------------------------------------------------

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSavedLogs(deviceId?: string): SavedLog[] {
  const all = useSyncExternalStore(subscribe, () => read(), () => read());
  // Sort newest-first; filter to a device when requested.
  return [...all]
    .filter((l) => !deviceId || l.deviceId === deviceId)
    .sort((a, b) => b.savedAt - a.savedAt);
}
