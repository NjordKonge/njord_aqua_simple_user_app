// Firmware OTA update-check helper.
//
// Fetches the firmware manifest (public/firmware/latest.json by default, or a
// remote URL via VITE_FIRMWARE_MANIFEST_URL) and decides whether the connected
// device should be offered an over-the-air update.
//
// The comparison is done against the device's reported **API version**
// (DeviceInfo.api, e.g. "2.12") because the firmware's VersionStr is only a
// build timestamp. Hardware compatibility is gated on DeviceInfo.hw.
//
// This module is intentionally UI-agnostic: it returns a plain result object.
// The actual OTA transfer lives in store.ts's `runOtaUpdate` and is triggered
// with the `ota_reboot` command.

import { useEffect, useState } from "react";
import type { DeviceInfo } from "../device/types";
import {
  firmwareFetch,
  githubCatalogUrl,
  githubManifestUrl,
} from "./firmwareSource";

/** Shape of firmware/latest.json. */
export interface FirmwareManifest {
  /** Semver of the latest firmware release, compared against DeviceInfo.api. */
  version: string;
  /** Minimum hardware revision this image supports (compared to DeviceInfo.hw). */
  min_hw?: string;
  /** Minimum API version required to accept this update (safety floor). */
  min_api?: string;
  /** URL of the padded AquaNord.bin (absolute, or relative to the manifest). */
  url: string;
  /** Image size in bytes (multiple of 8; the .bin is 0xFF-padded). */
  size: number;
  /** Optional CRC32 (hex string, e.g. "0x1a2b3c4d") for integrity verification. */
  crc32?: string | null;
  /** ISO date string of the release. */
  released?: string;
  /** Human-readable release notes shown in the update prompt. */
  notes?: string;
}

export interface UpdateCheckResult {
  /** True when a strictly-newer, hardware-compatible image is available. */
  updateAvailable: boolean;
  /** Device's current version (DeviceInfo.api). */
  current: string;
  /** Manifest's advertised version. */
  latest: string;
  /** The manifest that was evaluated. */
  manifest: FirmwareManifest;
  /** Set when a newer image exists but the device hardware is too old. */
  blockedByHw?: boolean;
  /** Set when the device API is below the manifest's min_api floor. */
  blockedByApi?: boolean;
}

/** Default manifest location. Priority: explicit VITE_FIRMWARE_MANIFEST_URL >
 *  configured private GitHub source > bundled copy. */
export const DEFAULT_MANIFEST_URL: string =
  (import.meta.env.VITE_FIRMWARE_MANIFEST_URL as string | undefined) ??
  githubManifestUrl() ??
  "/firmware/latest.json";

/** A single installable firmware release. Same shape as a manifest entry;
 *  `version` is required and used as the stable identity of the release. */
export type FirmwareRelease = FirmwareManifest;

/** Shape of firmware/index.json — the full catalog of installable releases. */
export interface FirmwareCatalog {
  /** Recommended (usually newest) version; matches latest.json's `version`. */
  latest: string;
  /** All releases that remain available to install, in any order. */
  releases: FirmwareRelease[];
}

/** Default catalog location. Priority: explicit VITE_FIRMWARE_CATALOG_URL >
 *  configured private GitHub source > bundled copy. */
export const DEFAULT_CATALOG_URL: string =
  (import.meta.env.VITE_FIRMWARE_CATALOG_URL as string | undefined) ??
  githubCatalogUrl() ??
  "/firmware/index.json";

/** Parse a dotted numeric version ("2.12", "0.93", "1.4.0") into segments.
 *  Returns null when the string is not version-shaped. */
export function parseSemver(v: string | undefined | null): number[] | null {
  if (!v) return null;
  const token = v.trim().split(/\s+/)[0]; // tolerate "2.12 (build ...)" forms
  const parts = token.split(".");
  const nums: number[] = [];
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (!Number.isFinite(n) || String(n) !== p.replace(/^0+(?=\d)/, "")) {
      // reject non-numeric segments (e.g. the "*" build placeholder)
      if (!/^\d+$/.test(p)) return null;
    }
    nums.push(Number.isFinite(n) ? n : 0);
  }
  return nums.length ? nums : null;
}

/** Compare two dotted versions. Returns <0 if a<b, 0 if equal, >0 if a>b.
 *  Unparseable versions sort as lowest. */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Fetch and validate the firmware manifest. Throws on network / shape errors. */
export async function fetchFirmwareManifest(
  url: string = DEFAULT_MANIFEST_URL,
  init?: RequestInit,
): Promise<FirmwareManifest> {
  const res = await firmwareFetch(url, { cache: "no-store", ...init });
  if (!res.ok) {
    throw new Error(`firmware manifest fetch failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as Partial<FirmwareManifest>;
  if (typeof json.version !== "string" || typeof json.url !== "string" || typeof json.size !== "number") {
    throw new Error("firmware manifest missing required fields (version, url, size)");
  }
  // Resolve a relative image URL against the manifest URL so remote hosting works.
  const resolvedUrl = new URL(json.url, new URL(url, window.location.href)).toString();
  return { ...(json as FirmwareManifest), url: resolvedUrl };
}

/** Fetch and validate the firmware catalog (index.json). Throws on network /
 *  shape errors. Releases are returned sorted newest-first and each release's
 *  `url` is resolved absolute against the catalog URL. */
export async function fetchFirmwareCatalog(
  url: string = DEFAULT_CATALOG_URL,
  init?: RequestInit,
): Promise<FirmwareCatalog> {
  const res = await firmwareFetch(url, { cache: "no-store", ...init });
  if (!res.ok) {
    throw new Error(`firmware catalog fetch failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as Partial<FirmwareCatalog>;
  if (!Array.isArray(json.releases)) {
    throw new Error("firmware catalog missing `releases` array");
  }
  const base = new URL(url, window.location.href);
  const releases: FirmwareRelease[] = json.releases
    .filter(
      (r): r is FirmwareRelease =>
        !!r &&
        typeof r.version === "string" &&
        typeof r.url === "string" &&
        typeof r.size === "number",
    )
    .map((r) => ({ ...r, url: new URL(r.url, base).toString() }))
    .sort((a, b) => compareSemver(b.version, a.version)); // newest first
  const latest = typeof json.latest === "string" ? json.latest : releases[0]?.version ?? "";
  return { latest, releases };
}

/** Find a release by exact version string. */
export function releaseByVersion(
  catalog: FirmwareCatalog,
  version: string,
): FirmwareRelease | undefined {
  return catalog.releases.find((r) => r.version === version);
}

/** True when a release is compatible with the device's hardware + API floor.
 *  This is orthogonal to newer/older: an OLDER compatible release is a valid
 *  downgrade target. */
export function isReleaseCompatible(
  info: { hw: string; api: string },
  r: FirmwareRelease,
): boolean {
  const hwOk = !r.min_hw || compareSemver(info.hw, r.min_hw) >= 0;
  const apiOk = !r.min_api || compareSemver(info.api, r.min_api) >= 0;
  return hwOk && apiOk;
}

/** Decide whether `info`'s device should be offered `manifest`. */
export function checkFirmwareUpdate(
  info: DeviceInfo,
  manifest: FirmwareManifest,
): UpdateCheckResult {
  const current = info.api;
  const latest = manifest.version;

  const newer = compareSemver(latest, current) > 0;
  const hwOk =
    !manifest.min_hw || compareSemver(info.hw, manifest.min_hw) >= 0;
  const apiOk =
    !manifest.min_api || compareSemver(info.api, manifest.min_api) >= 0;

  return {
    updateAvailable: newer && hwOk && apiOk,
    current,
    latest,
    manifest,
    blockedByHw: newer && !hwOk,
    blockedByApi: newer && !apiOk,
  };
}

/** Convenience: fetch the manifest and evaluate it for a device in one call.
 *  Returns null (never throws) when the manifest is unreachable so callers can
 *  silently skip the check offline. */
export async function getFirmwareUpdate(
  info: DeviceInfo,
  url: string = DEFAULT_MANIFEST_URL,
): Promise<UpdateCheckResult | null> {
  try {
    const manifest = await fetchFirmwareManifest(url);
    return checkFirmwareUpdate(info, manifest);
  } catch {
    return null;
  }
}

// ---- React binding ----------------------------------------------------------
// Module-level cache so the app fetches the manifest once and every consumer
// can synchronously read the same cached value.
let manifestCache: FirmwareManifest | null = null;
let manifestPromise: Promise<FirmwareManifest> | null = null;
const manifestSubs = new Set<() => void>();

/** Bundled copy shipped inside the app — offline fallback for the manifest. */
export const LOCAL_MANIFEST_URL = "/firmware/latest.json";

function loadManifestOnce(): Promise<FirmwareManifest> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      try {
        return await fetchFirmwareManifest(DEFAULT_MANIFEST_URL);
      } catch (e) {
        if (DEFAULT_MANIFEST_URL !== LOCAL_MANIFEST_URL) {
          return await fetchFirmwareManifest(LOCAL_MANIFEST_URL);
        }
        throw e;
      }
    })()
      .then((m) => {
        manifestCache = m;
        manifestSubs.forEach((cb) => cb());
        return m;
      })
      .catch((e) => {
        manifestPromise = null; // allow a later retry
        throw e;
      });
  }
  return manifestPromise;
}

/** Subscribe to the shared firmware manifest. Returns the cached manifest
 *  (or null until the first fetch resolves). Safe to call from many places. */
export function useFirmwareManifest(): FirmwareManifest | null {
  const [manifest, setManifest] = useState<FirmwareManifest | null>(manifestCache);
  useEffect(() => {
    let alive = true;
    const sync = () => { if (alive) setManifest(manifestCache); };
    manifestSubs.add(sync);
    loadManifestOnce().then(sync).catch(() => {});
    return () => { alive = false; manifestSubs.delete(sync); };
  }, []);
  return manifest;
}

// ---- Firmware catalog binding ----------------------------------------------
// Same shared-cache pattern as the manifest, for the full release list used by
// the firmware version picker.
let catalogCache: FirmwareCatalog | null = null;
let catalogPromise: Promise<FirmwareCatalog> | null = null;
const catalogSubs = new Set<() => void>();

/** Bundled copy shipped inside the app — used as an offline fallback when a
 *  remote catalog (VITE_FIRMWARE_CATALOG_URL) is configured but unreachable. */
export const LOCAL_CATALOG_URL = "/firmware/index.json";

function loadCatalogOnce(): Promise<FirmwareCatalog> {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      try {
        return await fetchFirmwareCatalog(DEFAULT_CATALOG_URL);
      } catch (e) {
        // Remote catalog unreachable (offline, host down, CORS) → fall back to
        // the copy bundled with the app so the user still sees shipped versions.
        if (DEFAULT_CATALOG_URL !== LOCAL_CATALOG_URL) {
          return await fetchFirmwareCatalog(LOCAL_CATALOG_URL);
        }
        throw e;
      }
    })()
      .then((c) => {
        catalogCache = c;
        catalogSubs.forEach((cb) => cb());
        return c;
      })
      .catch((e) => {
        catalogPromise = null; // allow a later retry
        throw e;
      });
  }
  return catalogPromise;
}

/** Subscribe to the shared firmware catalog (index.json). Returns the cached
 *  catalog (or null until the first fetch resolves). */
export function useFirmwareCatalog(): FirmwareCatalog | null {
  const [catalog, setCatalog] = useState<FirmwareCatalog | null>(catalogCache);
  useEffect(() => {
    let alive = true;
    const sync = () => { if (alive) setCatalog(catalogCache); };
    catalogSubs.add(sync);
    loadCatalogOnce().then(sync).catch(() => {});
    return () => { alive = false; catalogSubs.delete(sync); };
  }, []);
  return catalog;
}
