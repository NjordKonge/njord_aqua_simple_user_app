// Firmware version-picker controller.
//
// A tiny external store that tracks which device (if any) has the firmware
// version picker open. The picker dialog is mounted once (in the root layout)
// and callers just call `openFirmwarePicker(device)` — this avoids nesting a
// dialog inside another interactive element and matches the OtaDialog pattern.

import { useSyncExternalStore } from "react";

/** The device whose firmware the user is choosing a version for. */
export interface FirmwarePickerTarget {
  id: string;
  name: string;
  /** Currently-installed API version (DeviceInfo.api). */
  api: string;
  /** Hardware revision (DeviceInfo.hw) — gates release compatibility. */
  hw: string;
  /** Whether the device is currently connected (drives update vs. resume). */
  online: boolean;
}

let target: FirmwarePickerTarget | null = null;
const subs = new Set<() => void>();

function emit() {
  subs.forEach((cb) => cb());
}

/** Open the firmware version picker for a device. */
export function openFirmwarePicker(t: FirmwarePickerTarget) {
  target = t;
  emit();
}

/** Close the picker. */
export function closeFirmwarePicker() {
  if (target === null) return;
  target = null;
  emit();
}

/** Live picker target (null when closed). */
export function useFirmwarePicker(): FirmwarePickerTarget | null {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => target,
    () => target,
  );
}
