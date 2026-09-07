/**
 * The only place the simplified UI issues device commands.
 *
 * Command names map 1:1 onto the existing firmware wire commands via the
 * store (see the `CommandName` union in ./types):
 *   start_treatment -> START       stop_treatment -> STOP
 *   clear_fault     -> CLEARFAULT  clear_error    -> CLEARERR
 *
 * The firmware is fixed and shared with other software, so this layer only
 * ever sends commands that the technical app already sends.
 */
import { sendCommand } from "./store";

export function startTreatment(deviceId: string) {
  return sendCommand(deviceId, "start_treatment");
}

export function stopTreatment(deviceId: string) {
  return sendCommand(deviceId, "stop_treatment");
}

/** Clears a latched fault condition (CLEARFAULT). */
export function clearFault(deviceId: string) {
  return sendCommand(deviceId, "clear_fault");
}

/** Clears a hard-latched error after repeated retries (CLEARERR). */
export function clearError(deviceId: string) {
  return sendCommand(deviceId, "clear_error");
}

export { pairDevice, reconnectDevice, forgetDevice } from "./store";
