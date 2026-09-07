// =============================================================================
// Njord Aqua BLE GATT API · v1.0
// Types mirror the JSON payloads on the wire (snake_case preserved).
// See docs/BLE_API_SPEC.md.
// =============================================================================

export const SERVICE_UUID = "4E4A5244-4FE1-11EE-A2B0-0DEADBEEF001";
export const CHAR_UUID = {
  DEVICE_INFO: "0x02",
  LIVE_STATUS: "0x03",
  CONFIG: "0x04",
  COMMAND: "0x05",
  RESPONSE: "0x06",
  LOG_META: "0x07",
  LOG_DATA: "0x08",
} as const;

/** Seconds between Unix epoch and the device's 2000-01-01 epoch. */
export const NJORD_EPOCH_OFFSET = 946684800;

// ----- State machine ---------------------------------------------------------

/** Known state-machine state names (string in payload — others rendered as-is). */
export type DeviceStateName =
  | "BOOT"
  | "IDLE"
  | "ELECTROLYSIS_ACTIVE"
  | "ERROR";

/** Known fault codes. `"NONE"` means no active fault. */
export type FaultName =
  | "NONE"
  | "HARDWARE_FAULT"
  | "OVERCURRENT"
  | "ELECTRODE_OPEN";

export type PhaseName = "ON" | "WAIT" | "REST" | "";

// ----- Characteristic payloads ----------------------------------------------

/** 0x02 DeviceInfo (READ). Static identifiers refreshed once at connect. */
export interface DeviceInfo {
  fw: string;
  hw: string;
  api: string;
  device_id: number;
  unique_id: number;
  elec_id: number;
  features: number; // bit 0 = sonar present
}

/** 0x03 LiveStatus (READ + NOTIFY @ 2 s). */
export interface LiveStatus {
  state: DeviceStateName | string;
  fault: FaultName | string;
  elec_on: boolean;
  elec_ma: number;
  /** API v2.3 field 3 `cycle_avg_ma` — cycle average electrode current
   *  (mA), derived from delivered charge over bridge-active time of the
   *  active cycle. `elec_ma` (field 4 `live_elec_ma`) is the instantaneous
   *  reading; 0 when the bridge is not actively driving. */
  cycle_avg_ma: number;
  batt_mv: number;
  solar_mv: number;
  supply_mv: number;
  /** Water temperature in °C. `TEMP_SENTINEL` (-32768) indicates the
   *  thermistor reads open/short — display as "no reading" rather than a
   *  real temperature. */
  temp_c: number;
  deliv_uc: number;
  target_uc: number;
  phase: PhaseName | string;
  /** API v2.3 field 13 `cruise_duty_pm` — cruising (time-weighted average)
   *  duty cycle over the bridge-active time of the active cycle (‰ 0..1000).
   *  The previous instantaneous `duty_pm` field has been removed because it
   *  sampled at unpredictable phases of the PWM and was usually 0. */
  cruise_duty_pm: number;
  polarity: boolean;
  batt_ok: boolean;
  solar_ok: boolean;
  supply_ok: boolean;
  solar_ctrl: boolean;
  batt_conn: boolean;
  solar_conn: boolean;
  stepup_on: boolean;
  solar_chg_on: boolean;
  time: string; // "HH:MM:SS"
  /** API v2.0 field 24: duty is saturated (≥900‰) but current is not rising —
   *  PI is blocked from increasing further. Pre-condition for STEPUP 1. */
  inad_cur: boolean;
  /** API v2.0 field 25: ms elapsed in the current cycle phase (ON/REST).
   *  0 when not in ELECTROLYSIS_ACTIVE. Authoritative device-side clock —
   *  prefer over host-side timers to avoid drift. */
  phase_elapsed_ms: number;
  /** API v2.0 field 26: total duration in ms of the current cycle phase.
   *  0 when not in ELECTROLYSIS_ACTIVE. */
  phase_total_ms: number;
  /** API v2.3 field 11 `elec_mv` — calculated electrolysis voltage in mV
   *  (`cruise_duty_pm * supply_mv / 1000`). */
  elec_mv: number;
  /** API v2.0 field 28 `cycle_duration_s` — configured cycle duration (s),
   *  mirrors `cfg.cycle_s` but read live from the device. */
  cycle_duration_s: number;
  /** API v2.0 field 29 `target_ma` — configured target electrode current
   *  (mA), mirrors `cfg.target_ma` but read live from the device. */
  target_ma: number;
  /** API v2.0 field 30 `cycle_count` — persistent lifetime completed cycle
   *  counter. Survives reboot, cleared only by FACTORYRESET. */
  cycle_count: number;
  /** API v2.0 field 31 `reboot_count` — persistent reboot counter. */
  reboot_count: number;
  /** API v2.0 field 32 `batch_accum_c` — batch accumulated delivered charge.
   *  Wire unit is whole coulombs; we store ×1_000_000 (µC) to match the
   *  other charge fields in this UI. */
  batch_accum_uc: number;
  /** API v2.4 field 34 `charge_debt_c` — outstanding persistent charge debt
   *  in Coulombs. Accumulated from per-cycle shortfalls exceeding the 5 C
   *  deadband; reduced symmetrically by overshoot on debt-removal cycles.
   *  Saturates at uint32 max. Cleared by `RESETDEBT`. */
  charge_debt_c: number;
  /** API v2.4 field 35 `debt_removal_active` — `true` while debt-removal
   *  mode is enabled. Source of truth for the UI; the firmware auto-
   *  disables this when debt drops to within the 5 C deadband. */
  debt_removal_active: boolean;
  /** DEBUG: the exact raw CSV string this status was parsed from. Populated
   *  by parseLiveStatusCsv so the UI can surface the on-the-wire payload for
   *  firmware/version diagnostics. Optional — not present on empty defaults. */
  raw_csv?: string;
}

/** 0x04 Config (READ) — 18 persistent params. */
export interface NjordConfig {
  chloride_mg_l: number;
  gen_mg_per_c: number;
  decay_mg_l_s: number;
  buf_mg_l: number;
  elec_id: number;
  dev_id: number;
  tank_l: number;
  fill_l_mm: number;
  tank_max_mm: number;
  ph_x100: number; // 100..1400
  cond_ms: number;
  water_src: number; // 1..5
  cycle_s: number; // >=1
  cycle_c: number;
  target_ma: number; // 0..5000
  target_cl_mg_l: number;
  pwr_cfg: number; // 1..4
  elec_en: number; // 0 or 1
  /** API v2.13 key `pov` — electrode polarity override.
   *  0 = switching/alternating (default), 1 = fixed polarity 0 (LOW),
   *  2 = fixed polarity 1 (HIGH). Optional: absent on pre-v2.13 firmware
   *  (parsers default it to 0 = switching). */
  pol_override?: number; // 0..2
  /** API v2.12 key `nm` — user-settable name suffix advertised by the device.
   *  Empty => device advertises "NjordAqua"; otherwise "Njord-<suffix>".
   *  Charset [A-Za-z0-9 _-], max 12 chars. Optional: absent on pre-v2.12
   *  firmware (parsers default it to ""). */
  name_suffix?: string;
}

/** 0x07 LogMeta (READ) — positional CSV:
 *  `bytes_used, bytes_free, pct_used, chunk_payload_max`. */
export interface LogMeta {
  bytes_used: number;
  bytes_free: number;
  pct_used: number;
  chunk_payload_max: number; // currently 180
}

// ----- Log entries (parsed from 0x08 LogData text stream) -------------------
// Each LogData chunk is `<16B header><UTF-8 text payload>`. Payloads are
// reassembled then split on '\n'; each line is one CSV record with a 3-char
// prefix: TEL (telemetry), STT (state transition), SON (sonar). The device
// no longer emits binary entries or a separate ERROR entry type.

export type LogEntryType = "TEL" | "STT" | "SON";

export interface TelemetryLogEntry {
  ts: number; // seconds since 2000-01-01
  type: "TEL";
  battery_mv: number;
  solar_mv: number;
  supply_mv: number;
  temp_c: number;
  delivered_uc: number;
  target_uc: number;
  target_ma: number;
  polarity: number; // 0 or 1
  /** TEL v2.3 — cycle average electrode current (mA). */
  cycle_avg_ma: number;
  /** TEL v2.3 — cruising (time-weighted avg) duty cycle (‰). */
  cruise_duty_pm: number;
  /** TEL v2.3 — calculated electrolysis voltage (mV) = cruise_duty × supply / 1000. */
  elec_mv: number;
  /** TEL v2.3 — cycle duration (s). */
  cycle_dur_s: number;
  /** TEL v2.3 — persistent lifetime cycle counter at write time. */
  cycle_count: number;
  /** TEL v2.3 — persistent reboot counter at write time. */
  reboot_count: number;
  /** TEL v2.4 — outstanding charge debt in C **after** this cycle's update. */
  charge_debt_c: number;
  /** TEL v2.4 — coulombs of overshoot credited back against the debt this
   *  cycle (0 on shortfall / normal cycles). */
  debt_removed_c: number;
  /** TEL v2.9 — batch running-average snapshot folded into each TEL row so a
   *  TEL-only export is self-contained. Zero on pre-v2.9 firmware. */
  batch_avg_batt_mv: number;
  batch_avg_supply_mv: number;
  batch_avg_solar_mv: number;
  batch_avg_elec_ma: number;
  batch_avg_temp_c: number;
  /** TEL v2.9 — batch accumulated charge in Coulombs. */
  batch_accum_c: number;
  /** TEL v2.9 — completed electrolysis cycles in this batch. */
  batch_cycles: number;
}
export interface StateLogEntry {
  ts: number;
  type: "STT";
  state: number;
  fault: number;
  delivered_uc: number;
  target_uc: number;
  duration_s: number; // 0 on ELECTROLYSIS_ACTIVE entry; non-zero on IDLE/ERROR exit
}
export interface SonarLogEntry {
  ts: number;
  type: "SON";
  dist_mm: number;
  peak_delta: number;
  baseline: number;
}
export type LogEntry = TelemetryLogEntry | StateLogEntry | SonarLogEntry;

/** Synthetic batch-treatment stats; transmitted as the seq=0 chunk of every
 *  STARTLOGDL transfer. Survives reboot, resettable via RESETBATCH. */
export interface BatchStats {
  samples: number;
  cycles: number;
  avgBat_mv: number;
  avgSup_mv: number;
  avgSol_mv: number;
  avgElec_ma: number;
  avgTemp_c: number;
  avgDist_mm: number;
  accumUC: number;
  updatedAt: number; // host ms when this BATCH line was received
}

// ----- Command / Response protocol ------------------------------------------

export type CommandName =
  | "get_status"
  | "get_config"
  | "set_config"
  | "sync_time"
  | "start_treatment"
  | "stop_treatment"
  | "enter_debug"
  | "clear_error"
  | "request_log_info"
  | "start_log_download"
  | "cancel_log_download"
  | "delete_logs"
  | "factory_reset"
  | "reset_batch"
  | "start_batch"
  | "stop_batch"
  | "set_timer"
  | "stop_timer"
  | "get_timer"
  | "set_charging"
  | "step_up"
  | "clear_fault"
  | "debt_removal"
  | "reset_debt"
  | "reboot"
  | "set_name"
  | "remove_bond";

export interface CommandFrame<D = unknown> {
  id: number;
  cmd: CommandName | string;
  data?: D;
}

export interface ResponseFrame<D = unknown> {
  id: number;
  ok: boolean;
  data?: D;
  error?: string;
}

/** UI-side record of a command request + the matched response. */
export interface CommandEntry {
  uid: string; // local UI id
  reqId: number; // wire `id` echoed in response
  deviceId: string;
  cmd: string;
  data?: unknown;
  sentAt: number;
  status: "pending" | "ok" | "error";
  responseAt?: number;
  response?: unknown;
  error?: string;
}

// ----- Derived / UI-side models ---------------------------------------------

/** A live rolling telemetry sample (subset of LiveStatus over time). */
export interface TelemetrySample {
  t: number; // host ms
  elec_ma: number;
  batt_mv: number;
  solar_mv: number;
  supply_mv: number;
  temp_c: number;
  cruise_duty_pm: number;
  deliv_uc: number;
}

/** UI-side alarm derived from LiveStatus.fault (and connection state). */
export type AlarmSeverity = "info" | "warning" | "error" | "critical";
export interface Alarm {
  id: string;
  code: string; // fault name
  message: string;
  severity: AlarmSeverity;
  timestamp: number;
  acknowledged?: boolean;
  deviceId: string;
}

/**
 * Aggregated device record consumed by the UI.
 * Combines DeviceInfo + latest LiveStatus + BLE link metadata.
 * Field names follow the BLE wire spec (snake_case) where they map 1:1.
 */
export interface Device {
  // identity / link
  id: string; // human handle, derived from unique_id
  name: string;
  location: string;
  online: boolean;
  /** True while an auto/manual reconnect attempt is in flight (link is down
   *  but the store is actively trying to re-establish it). Drives the
   *  "reconnecting…" affordance in the disconnected overlay. */
  reconnecting?: boolean;
  rssi: number; // dBm
  lastUpdate: number; // host ms of last notify
  uptimeSec: number;
  // BLE diagnostics (host-side)
  packet_loss_pct: number;
  tx_count: number;
  rx_count: number;
  reconnects: number;
  // DeviceInfo (0x02)
  info: DeviceInfo;
  // LiveStatus (0x03)
  status: LiveStatus;
  // Derived
  alarms: Alarm[];
}
