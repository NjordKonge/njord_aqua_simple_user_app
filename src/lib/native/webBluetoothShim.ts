// =============================================================================
// Web Bluetooth → Capacitor BLE shim.
//
// The production UI is driven by src/lib/device/store.ts, which talks to the
// standard Web Bluetooth API (`navigator.bluetooth`). That API does NOT exist
// inside the Android System WebView, so on native (Capacitor) builds we install
// a small polyfill here that implements exactly the subset of Web Bluetooth the
// store uses, backed by @capacitor-community/bluetooth-le (the real Android BLE
// stack). This lets the entire store + UI run unchanged on the phone.
//
// Surface implemented (everything store.ts touches):
//   navigator.bluetooth.requestDevice(opts)          -> native device picker
//   navigator.bluetooth.getDevices()                 -> previously paired ids
//   BluetoothDevice: id, name, gatt, forget(),
//                    addEventListener('gattserverdisconnected')
//   gatt(server): connect(), disconnect(), connected
//   server.getPrimaryService(uuid)
//   service.getCharacteristic(uuid)
//   characteristic: value, readValue(), writeValue(), writeValueWithoutResponse(),
//                   startNotifications(), addEventListener('characteristicvaluechanged')
//
// Only the subset above is implemented — adding more is straightforward.
// =============================================================================
import { Capacitor } from "@capacitor/core";
import {
  BleClient,
  ConnectionPriority,
  numbersToDataView,
  type RequestBleDeviceOptions,
} from "@capacitor-community/bluetooth-le";

// localStorage key the store already uses to persist paired devices. We read it
// so getDevices() can offer previously paired devices for silent reconnect.
const PAIRED_KEY = "njord.pairedDevices.v1";

let initPromise: Promise<void> | null = null;
function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = BleClient.initialize({ androidNeverForLocation: true });
  }
  return initPromise;
}

function toDataView(value: BufferSource): DataView {
  if (value instanceof DataView) return value;
  if (value instanceof ArrayBuffer) return new DataView(value);
  const view = value as ArrayBufferView;
  return new DataView(view.buffer, view.byteOffset, view.byteLength);
}

// ---- Characteristic ---------------------------------------------------------
class ShimCharacteristic extends EventTarget {
  value: DataView | null = null;
  private notifying = false;

  constructor(
    readonly uuid: string,
    private readonly deviceId: string,
    private readonly serviceUuid: string,
  ) {
    super();
  }

  async readValue(): Promise<DataView> {
    await ensureInit();
    const v = await BleClient.read(this.deviceId, this.serviceUuid, this.uuid);
    this.value = v;
    return v;
  }

  async writeValue(value: BufferSource): Promise<void> {
    await ensureInit();
    await BleClient.write(
      this.deviceId,
      this.serviceUuid,
      this.uuid,
      toDataView(value),
    );
  }

  async writeValueWithoutResponse(value: BufferSource): Promise<void> {
    await ensureInit();
    await BleClient.writeWithoutResponse(
      this.deviceId,
      this.serviceUuid,
      this.uuid,
      toDataView(value),
    );
  }

  async startNotifications(): Promise<ShimCharacteristic> {
    await ensureInit();
    if (this.notifying) return this;
    this.notifying = true;
    await BleClient.startNotifications(
      this.deviceId,
      this.serviceUuid,
      this.uuid,
      (value) => {
        this.value = value;
        // Web Bluetooth sets event.target to the characteristic; dispatching on
        // `this` does exactly that, so store.ts's `ev.target.value` works.
        this.dispatchEvent(new Event("characteristicvaluechanged"));
      },
    );
    return this;
  }

  async stopNotifications(): Promise<ShimCharacteristic> {
    if (!this.notifying) return this;
    this.notifying = false;
    try {
      await BleClient.stopNotifications(
        this.deviceId,
        this.serviceUuid,
        this.uuid,
      );
    } catch {
      /* best-effort */
    }
    return this;
  }
}

// ---- Service ----------------------------------------------------------------
class ShimService {
  private chars = new Map<string, ShimCharacteristic>();

  constructor(
    readonly uuid: string,
    private readonly deviceId: string,
  ) {}

  async getCharacteristic(uuid: string): Promise<ShimCharacteristic> {
    const key = uuid.toLowerCase();
    let c = this.chars.get(key);
    if (!c) {
      c = new ShimCharacteristic(key, this.deviceId, this.uuid);
      this.chars.set(key, c);
    }
    return c;
  }
}

// ---- GATT server ------------------------------------------------------------
class ShimGatt {
  connected = false;
  private services = new Map<string, ShimService>();

  constructor(
    readonly device: ShimBluetoothDevice,
    private readonly deviceId: string,
  ) {}

  async connect(): Promise<ShimGatt> {
    await ensureInit();
    // Cap how long the Android stack may sit on a single connect attempt.
    // Without this the platform can block 20–30 s on a sleeping / just-out-of-
    // range device, which is what makes re-pairing feel slow — the store's
    // exponential backoff can't retry until this promise settles. Failing fast
    // (~10 s) lets the next attempt fire while the device is advertising again.
    await BleClient.connect(
      this.deviceId,
      () => {
        this.connected = false;
        this.device.dispatchEvent(new Event("gattserverdisconnected"));
      },
      { timeout: 10_000 },
    );
    this.connected = true;
    // Ask Android for a high-priority (low-latency) connection interval. This
    // markedly speeds up the burst of service discovery + initial reads that
    // happens right after linking, so the device card populates much faster.
    // Best-effort: not available on the web build and harmless if it throws.
    try {
      await BleClient.requestConnectionPriority(
        this.deviceId,
        ConnectionPriority.CONNECTION_PRIORITY_HIGH,
      );
    } catch {
      /* unsupported on web / already balanced — ignore */
    }
    return this;
  }

  disconnect(): void {
    // Web Bluetooth's disconnect is sync (fire-and-forget). The disconnect
    // callback wired in connect() flips `connected` and notifies the store.
    this.connected = false;
    void BleClient.disconnect(this.deviceId).catch(() => {});
  }

  async getPrimaryService(uuid: string): Promise<ShimService> {
    const key = uuid.toLowerCase();
    let s = this.services.get(key);
    if (!s) {
      s = new ShimService(key, this.deviceId);
      this.services.set(key, s);
    }
    return s;
  }
}

// ---- Device -----------------------------------------------------------------
class ShimBluetoothDevice extends EventTarget {
  readonly gatt: ShimGatt;

  constructor(
    readonly id: string,
    readonly name: string | undefined,
  ) {
    super();
    this.gatt = new ShimGatt(this, id);
  }

  async forget(): Promise<void> {
    try {
      await BleClient.disconnect(this.id);
    } catch {
      /* may already be gone */
    }
  }
}

// ---- navigator.bluetooth ----------------------------------------------------
interface ShimRequestFilter {
  services?: string[];
  namePrefix?: string;
}
interface ShimRequestOptions {
  filters?: ShimRequestFilter[];
  optionalServices?: string[];
  acceptAllDevices?: boolean;
}

const deviceCache = new Map<string, ShimBluetoothDevice>();
function getOrCreateDevice(id: string, name?: string): ShimBluetoothDevice {
  let d = deviceCache.get(id);
  if (!d) {
    d = new ShimBluetoothDevice(id, name);
    deviceCache.set(id, d);
  }
  return d;
}

function loadPairedIds(): string[] {
  try {
    const raw = localStorage.getItem(PAIRED_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((d: { id?: string }) => d?.id)
      .filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

class ShimBluetooth {
  async getAvailability(): Promise<boolean> {
    return true;
  }

  async requestDevice(
    options: ShimRequestOptions = {},
  ): Promise<ShimBluetoothDevice> {
    await ensureInit();

    // Collect optional services so the GATT service is accessible post-connect.
    const optionalServices = new Set<string>(
      (options.optionalServices ?? []).map((s) => s.toLowerCase()),
    );
    let namePrefix: string | undefined;
    for (const f of options.filters ?? []) {
      f.services?.forEach((s) => optionalServices.add(s.toLowerCase()));
      if (f.namePrefix && !namePrefix) namePrefix = f.namePrefix;
    }

    // We intentionally do NOT pass a `services` scan filter: the device does
    // not always advertise the 128-bit service UUID, which would hide it from
    // the picker. We rely on namePrefix (when present) instead and expose the
    // service via optionalServices for post-connect access.
    const req: RequestBleDeviceOptions = {
      optionalServices: Array.from(optionalServices),
    };
    if (namePrefix) req.namePrefix = namePrefix;

    const ble = await BleClient.requestDevice(req);
    return getOrCreateDevice(ble.deviceId, ble.name);
  }

  async getDevices(): Promise<ShimBluetoothDevice[]> {
    await ensureInit();
    const ids = loadPairedIds();
    if (ids.length === 0) return [];
    try {
      const devices = await BleClient.getDevices(ids);
      return devices.map((d) => getOrCreateDevice(d.deviceId, d.name));
    } catch {
      // Fall back to bare ids so the store can still attempt reconnects.
      return ids.map((id) => getOrCreateDevice(id));
    }
  }
}

/**
 * Install the Web Bluetooth shim on `navigator.bluetooth` when running inside
 * the native (Capacitor) Android app. No-op on the web build, where the real
 * Web Bluetooth API is used instead. Safe to call multiple times.
 */
export function installWebBluetoothShim(): void {
  if (!Capacitor.isNativePlatform()) return;
  const nav = navigator as Navigator & { bluetooth?: unknown };
  if (nav.bluetooth) return; // already present (real or previously shimmed)
  Object.defineProperty(nav, "bluetooth", {
    value: new ShimBluetooth(),
    configurable: true,
    writable: false,
  });
}

// Re-export so callers can build command payloads consistently if needed.
export { numbersToDataView };
