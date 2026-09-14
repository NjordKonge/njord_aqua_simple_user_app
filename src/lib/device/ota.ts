/// <reference types="web-bluetooth" />
// =============================================================================
// Njord Aqua — BLE OTA firmware update client.
//
// Implements ota_app_integration_patch.md exactly: reboot the connected
// device into the ST BLE_Ota loader, reconnect to it by advertised NAME
// (it does not advertise the fe20 service, and uses a different BLE
// address than the app), stream the `.bin`, then finish. See that document
// for the full protocol rationale — this file mirrors its §4.2 Web
// Bluetooth reference implementation almost verbatim, since store.ts
// already talks to `navigator.bluetooth` directly (shimmed onto
// @capacitor-community/bluetooth-le on native — see webBluetoothShim.ts),
// so the exact same calls work unchanged on the phone.
// =============================================================================
import { sendCommand, setAutoReconnect, reconnectDevice } from "./store";

export const OTA_SERVICE = "0000fe20-cc7a-482a-984a-7f2ed5b3e58f";
export const OTA_CHAR_BASE = "0000fe22-8e22-4541-9d4c-21edae82ed19";
export const OTA_CHAR_CONFIRM = "0000fe23-8e22-4541-9d4c-21edae82ed19";
export const OTA_CHAR_RAW = "0000fe24-8e22-4541-9d4c-21edae82ed19";

/** Fixed by the firmware linker (§2.1) — do not change without confirming
 *  with the firmware team. */
const APP_FLASH_ADDR = 0x08007000;
/** ≤240 B, a multiple of 8, per §2.2. */
const CHUNK_SIZE = 240;
const FINISH_ATTEMPTS = 4;
const FINISH_WAIT_MS = 4000;
const CONNECT_RETRIES = 3;

export class OtaCancelled extends Error {
  constructor() {
    super("Firmware update cancelled");
    this.name = "OtaCancelled";
  }
}

export type OtaPhase =
  | "idle"
  | "rebooting"
  | "scanning"
  | "connecting"
  | "erasing"
  | "streaming"
  | "finishing"
  | "reconnecting"
  | "success"
  | "power-cycle-hint"
  | "error";

export interface OtaState {
  phase: OtaPhase;
  attempt: number;
  /** 0..1, only meaningful during "streaming". */
  progress: number;
  message: string;
  error?: string;
}

function waitMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Pad with 0xFF to a multiple of 8 bytes — §2.2 "total image length must
 *  be a multiple of 8" (the device programs flash in 8-byte doublewords). */
export function padFirmwareTo8(bytes: Uint8Array): Uint8Array {
  const rem = bytes.length % 8;
  if (rem === 0) return bytes;
  const pad = 8 - rem;
  const out = new Uint8Array(bytes.length + pad);
  out.set(bytes);
  out.fill(0xff, bytes.length);
  return out;
}

/**
 * Runs the full OTA sequence for `deviceId` against `firmware` (already
 * padded to %8==0 — call padFirmwareTo8 first if you haven't). Reports
 * progress via `onState`. Pass `signal` to allow cancellation between
 * chunks (cancellation mid-erase cannot be undone — the loader has already
 * wiped the app region and needs a completed upload to recover, exactly as
 * documented in §3 "Recovery").
 */
export async function runOtaUpdate(
  deviceId: string,
  firmware: Uint8Array,
  onState: (state: OtaState) => void,
  signal?: AbortSignal,
): Promise<void> {
  const bin = padFirmwareTo8(firmware);
  const emit = (phase: OtaPhase, patch: Partial<OtaState> = {}) =>
    onState({ phase, attempt: patch.attempt ?? 0, progress: patch.progress ?? 0, message: patch.message ?? "", error: patch.error });
  const checkCancel = () => {
    if (signal?.aborted) throw new OtaCancelled();
  };

  // 1. Enter OTA mode from the normal connection (§1.1). The device
  // disconnects almost immediately as it resets into the loader — we don't
  // wait for a response, just give it a moment before scanning.
  emit("rebooting", { message: "Rebooting device into firmware-update mode…" });
  setAutoReconnect(deviceId, false);
  try {
    sendCommand(deviceId, "ota_reboot");
    await waitMs(1200);
    checkCancel();

    let lastErr: unknown;
    for (let attempt = 1; attempt <= CONNECT_RETRIES; attempt++) {
      checkCancel();
      try {
        const outcome = await attemptOnce(bin, attempt, emit, checkCancel);
        // Best-effort: give the new firmware a few seconds to boot, then
        // reconnect to the ORIGINAL device address (the app image reboots
        // back into the normal advertisement, unlike the loader).
        if (outcome === "ambiguous") {
          // Neither the indication nor a disconnect arrived — the image is
          // almost certainly written (§2.3), but we can't be sure the device
          // is currently rebooting, so don't claim success outright.
          setAutoReconnect(deviceId, true);
          reconnectDevice(deviceId).catch(() => {});
          return;
        }
        emit("reconnecting", { attempt, progress: 1, message: "Update sent — waiting for the device to restart…" });
        await waitMs(4000);
        setAutoReconnect(deviceId, true);
        reconnectDevice(deviceId).catch(() => {});
        emit("success", { attempt, progress: 1, message: "Firmware update complete." });
        return;
      } catch (e) {
        if (e instanceof OtaCancelled) throw e;
        lastErr = e;
        if (attempt === CONNECT_RETRIES) break;
        const msg = e instanceof Error ? e.message : String(e);
        emit("error", { attempt, message: `Attempt ${attempt} failed (${msg}) — retrying…`, error: msg });
        await waitMs(1500);
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    emit("error", { message: "Firmware update failed.", error: msg });
    throw lastErr instanceof Error ? lastErr : new Error(msg);
  } finally {
    setAutoReconnect(deviceId, true);
  }
}

async function attemptOnce(
  bin: Uint8Array,
  attempt: number,
  emit: (phase: OtaPhase, patch?: Partial<OtaState>) => void,
  checkCancel: () => void,
): Promise<"confirmed" | "ambiguous"> {
  emit("scanning", { attempt, message: "Waiting for the device to reappear as STM_OTA…" });
  const nav = navigator as Navigator & { bluetooth?: Bluetooth };
  if (!nav.bluetooth) throw new Error("Bluetooth is not available");

  // §1.2 / §4.2: the loader does NOT advertise fe20, so filter by the
  // advertised NAME, not by service. List fe20 as optionalServices so it's
  // reachable once connected.
  const dev = await nav.bluetooth.requestDevice({
    filters: [{ namePrefix: "STM" }],
    optionalServices: [OTA_SERVICE],
  });

  let gotConfirm = false;
  let didDisconnect = false;
  const onDisconnect = () => { didDisconnect = true; };
  dev.addEventListener("gattserverdisconnected", onDisconnect);

  try {
    checkCancel();
    emit("connecting", { attempt, message: "Connecting to firmware-update mode…" });
    if (!dev.gatt) throw new Error("Device has no GATT server");
    const gatt = await dev.gatt.connect();
    const svc = await gatt.getPrimaryService(OTA_SERVICE);
    const baseCh = await svc.getCharacteristic(OTA_CHAR_BASE);
    const confCh = await svc.getCharacteristic(OTA_CHAR_CONFIRM);
    const rawCh = await svc.getCharacteristic(OTA_CHAR_RAW);

    confCh.addEventListener("characteristicvaluechanged", (ev: Event) => {
      const v = (ev.target as BluetoothRemoteGATTCharacteristic).value;
      if (v && v.byteLength > 0 && v.getUint8(0) === 0x01) gotConfirm = true;
    });
    // Enable indications BEFORE finishing (§1.2 step 4 / §2.3).
    await confCh.startNotifications();

    checkCancel();
    // §2.1: start app upload — ERASES the app region. fe22 is
    // write-WITHOUT-response only.
    emit("erasing", { attempt, message: "Erasing existing firmware…" });
    await baseCh.writeValueWithoutResponse(
      new Uint8Array([
        0x02,
        (APP_FLASH_ADDR >> 16) & 0xff,
        (APP_FLASH_ADDR >> 8) & 0xff,
        APP_FLASH_ADDR & 0xff,
      ]),
    );

    // §2.2: stream in order, ≤240 B chunks, paced every 6 chunks.
    emit("streaming", { attempt, progress: 0, message: "Sending firmware…" });
    for (let offset = 0; offset < bin.length; offset += CHUNK_SIZE) {
      if (didDisconnect) throw new Error("Connection lost while sending firmware");
      checkCancel();
      await rawCh.writeValueWithoutResponse(bin.slice(offset, offset + CHUNK_SIZE));
      if ((offset / CHUNK_SIZE) % 6 === 0) await waitMs(6);
      emit("streaming", { attempt, progress: Math.min(1, (offset + CHUNK_SIZE) / bin.length), message: "Sending firmware…" });
    }
    emit("streaming", { attempt, progress: 1, message: "Sending firmware…" });

    // §2.1/§2.3: finish — the loader reboots the instant it accepts this,
    // so the indication is frequently lost. Treat a disconnect as success
    // and re-send a few times if we get neither.
    emit("finishing", { attempt, progress: 1, message: "Finishing update…" });
    for (let i = 0; i < FINISH_ATTEMPTS; i++) {
      await baseCh.writeValueWithoutResponse(new Uint8Array([0x07, 0x00, 0x00, 0x00]));
      const t0 = Date.now();
      while (Date.now() - t0 < FINISH_WAIT_MS) {
        if (gotConfirm || didDisconnect) return "confirmed";
        await waitMs(100);
      }
    }
    // Sent everything but got neither the indication nor a disconnect — the
    // image is almost certainly programmed (§2.3 step 4); surface this so
    // the UI can suggest a power-cycle rather than reporting a hard failure.
    emit("power-cycle-hint", {
      attempt,
      progress: 1,
      message: "Firmware sent, but the device didn't confirm — power-cycle it to boot the new firmware.",
    });
    return "ambiguous";
  } finally {
    dev.removeEventListener("gattserverdisconnected", onDisconnect);
  }
}
