// =============================================================================
// Njord Aqua — local firmware backup library.
//
// Stores imported `.bin` firmware images on-device (via @capacitor/filesystem,
// which also has a web/IndexedDB-backed implementation, so this works in the
// browser dev build too) so the user always has a local copy of every
// firmware they've loaded and can re-flash any of them without needing a
// network connection or re-importing the file. Metadata (label, size, crc32,
// import date) lives in a small manifest.json next to the .bin files — the
// filenames themselves are opaque ids so labels can contain any characters.
//
// This deliberately does NOT implement §8 of ota_app_integration_patch.md
// (the remote JSON catalog / GitHub-token hosting option) — embedding any
// long-lived token in a shipped client is extractable, and nothing here
// requires it: the user supplies `.bin` files directly (e.g. AirDropped /
// downloaded from wherever they get them) and the app just remembers them.
// =============================================================================
import { Directory, Filesystem } from "@capacitor/filesystem";

const FW_DIR = "firmware";
const MANIFEST_PATH = `${FW_DIR}/manifest.json`;

export interface FirmwareEntry {
  /** Opaque filename (not the user-facing label), e.g. "1737000000000.bin". */
  id: string;
  /** User-facing label — defaults to the imported file's own name. */
  label: string;
  size: number;
  crc32: string;
  importedAt: number;
}

interface Manifest {
  entries: FirmwareEntry[];
}

let dirEnsured = false;
async function ensureDir(): Promise<void> {
  if (dirEnsured) return;
  try {
    await Filesystem.mkdir({ path: FW_DIR, directory: Directory.Data, recursive: true });
  } catch {
    /* already exists */
  }
  dirEnsured = true;
}

async function readManifest(): Promise<Manifest> {
  await ensureDir();
  try {
    const res = await Filesystem.readFile({ path: MANIFEST_PATH, directory: Directory.Data, encoding: undefined });
    const text = typeof res.data === "string" ? base64ToUtf8(res.data) : await (res.data as Blob).text();
    const parsed = JSON.parse(text) as Manifest;
    if (!Array.isArray(parsed.entries)) return { entries: [] };
    return parsed;
  } catch {
    return { entries: [] };
  }
}

async function writeManifest(m: Manifest): Promise<void> {
  await ensureDir();
  await Filesystem.writeFile({
    path: MANIFEST_PATH,
    directory: Directory.Data,
    data: utf8ToBase64(JSON.stringify(m)),
  });
}

// ---- base64 <-> bytes/text helpers -----------------------------------------
// Chunked to avoid call-stack blowups on ~100 KB firmware images (a single
// String.fromCharCode(...bigArray) spread can exceed engine argument limits).
const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function utf8ToBase64(s: string): string {
  return bytesToBase64(new TextEncoder().encode(s));
}
function base64ToUtf8(b64: string): string {
  return new TextDecoder().decode(base64ToBytes(b64));
}

// ---- CRC-32 (IEEE 802.3 / zlib) — matches the firmware's own crc32.cpp -----
let crcTable: Uint32Array | null = null;
function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  crcTable = t;
  return t;
}

export function crc32(bytes: Uint8Array): string {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  return `0x${crc.toString(16).padStart(8, "0")}`;
}

// ---- Public API -------------------------------------------------------------

export async function listFirmwareEntries(): Promise<FirmwareEntry[]> {
  const m = await readManifest();
  return [...m.entries].sort((a, b) => b.importedAt - a.importedAt);
}

/** Import a firmware `.bin` (already read into memory) into the local
 *  backup library under `label`. Pads to a multiple of 8 bytes (the OTA
 *  protocol requires this) before saving, so the stored copy is always
 *  ready to flash as-is. Returns the new entry. */
export async function importFirmware(bytes: Uint8Array, label: string): Promise<FirmwareEntry> {
  await ensureDir();
  const rem = bytes.length % 8;
  const padded = rem === 0 ? bytes : (() => {
    const out = new Uint8Array(bytes.length + (8 - rem));
    out.set(bytes);
    out.fill(0xff, bytes.length);
    return out;
  })();

  const id = `${Date.now()}.bin`;
  await Filesystem.writeFile({
    path: `${FW_DIR}/${id}`,
    directory: Directory.Data,
    data: bytesToBase64(padded),
  });

  const entry: FirmwareEntry = {
    id,
    label: label.trim() || "Untitled firmware",
    size: padded.length,
    crc32: crc32(padded),
    importedAt: Date.now(),
  };
  const m = await readManifest();
  m.entries.push(entry);
  await writeManifest(m);
  return entry;
}

export async function loadFirmwareBytes(id: string): Promise<Uint8Array> {
  const res = await Filesystem.readFile({ path: `${FW_DIR}/${id}`, directory: Directory.Data, encoding: undefined });
  if (typeof res.data === "string") return base64ToBytes(res.data);
  return new Uint8Array(await (res.data as Blob).arrayBuffer());
}

export async function deleteFirmwareEntry(id: string): Promise<void> {
  const m = await readManifest();
  m.entries = m.entries.filter((e) => e.id !== id);
  await writeManifest(m);
  try {
    await Filesystem.deleteFile({ path: `${FW_DIR}/${id}`, directory: Directory.Data });
  } catch {
    /* already gone */
  }
}

export async function renameFirmwareEntry(id: string, label: string): Promise<void> {
  const m = await readManifest();
  const e = m.entries.find((x) => x.id === id);
  if (!e) return;
  e.label = label.trim() || e.label;
  await writeManifest(m);
}
