/**
 * Alert reference list for the Alerts screen and Settings "Alert information"
 * sheet.
 *
 * The spec's fixed list includes "Salt level too low" — this device has NO
 * salt sensor (it is an electrode electrolysis chlorinator powered by
 * battery/solar, see Solar_and_BMS.cpp / HardwareStatus.cpp in the firmware
 * repo, not a salt-cell system), so that entry is not applicable and has been
 * replaced with the real hardware-fault categories the firmware reports
 * (see severityForFault / alarmsFromStatus in ./store). This substitution
 * should be confirmed with the PM/firmware owner.
 *
 * A real salt-level concept IS planned, based on water conductivity — once
 * firmware exposes a conductivity reading + low-conductivity fault code,
 * add an entry here. See patch.md §1.
 */
export interface AlertTypeInfo {
  code: string;
  title: string;
  explanation: string;
}

export const ALERT_REFERENCE: AlertTypeInfo[] = [
  {
    code: "OFFLINE",
    title: "Device not connected",
    explanation:
      "Your phone has lost its Bluetooth connection to the device. Move closer, or check that the device has power.",
  },
  {
    code: "HARDWARE_FAULT",
    title: "Hardware issue",
    explanation:
      "A hardware fault was detected. This clears automatically once the underlying issue goes away.",
  },
  {
    code: "OVERCURRENT",
    title: "Electrode over-current",
    explanation:
      "Treatment paused because too much current was drawn. The device retries automatically, up to 5 times.",
  },
  {
    code: "ELECTRODE_OPEN",
    title: "Electrode not detected",
    explanation:
      "No connection to the electrode. Check the electrode cable. The device retries automatically.",
  },
  {
    code: "BATT_HW",
    title: "Battery issue",
    explanation: "The battery's hardware status is not OK. Check the battery connection.",
  },
  {
    code: "SUPPLY_HW",
    title: "Power input issue",
    explanation: "The external power supply's hardware status is not OK. Check the power input.",
  },
  {
    code: "SOLAR_HW",
    title: "Solar input issue",
    explanation: "The solar input's hardware status is not OK. Check the solar panel connection.",
  },
  {
    code: "THERM_OPEN",
    title: "Temperature sensor issue",
    explanation:
      "The water temperature sensor is disconnected. This does not stop treatment, but temperature readings are unavailable.",
  },
];
