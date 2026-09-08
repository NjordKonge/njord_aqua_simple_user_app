/// <reference types="web-bluetooth" />
// =============================================================================
// Njord Aqua — live BLE store (Web Bluetooth).
// Drives the UI from real GATT connections to NjordAqua devices.
// See docs/BLE_API_SPEC.md.
// =============================================================================
import { useEffect, useState } from "react";
import type {
  Alarm,
  AlarmSeverity,
  BatchStats,
  CommandEntry,
  Device,
  DeviceInfo,
  LiveStatus,
  LogEntry,
  LogMeta,
  NjordConfig,
  SonarLogEntry,
  StateLogEntry,
  TelemetryLogEntry,
  TelemetrySample,
} from "./types";

// ---- UUIDs (Web Bluetooth wants lowercase, full 128-bit) -------------------
const SERVICE_UUID = "4e4a5244-4fe1-11ee-a2b0-0deadbeef001";
const CHAR = {
  DEVICE_INFO: "4e4a5244-4fe1-11ee-a2b0-0deadbeef002",
  LIVE_STATUS: "4e4a5244-4fe1-11ee-a2b0-0deadbeef003",
  CONFIG:      "4e4a5244-4fe1-11ee-a2b0-0deadbeef004",
  COMMAND:     "4e4a5244-4fe1-11ee-a2b0-0deadbeef005",
  RESPONSE:    "4e4a5244-4fe1-11ee-a2b0-0deadbeef006",
  LOG_META:    "4e4a5244-4fe1-11ee-a2b0-0deadbeef007",
  LOG_DATA:    "4e4a5244-4fe1-11ee-a2b0-0deadbeef008",
  SONAR_DBG:   "4e4a5244-4fe1-11ee-a2b0-0deadbeef009",
} as const;

// ---- Fault severity mapping -------------------------------------------------
/** Thermistor sentinel: device reports this when the probe is open/shorted.
 *  Firmware v2.3 treats a missing thermistor as a warning only — it does
 *  NOT block electrolysis (units are sometimes deployed without one). */
export const TEMP_SENTINEL = -32768;

export function severityForFault(fault: string): AlarmSeverity {
  switch (fault) {
    case "NONE": return "info";
    // v2.3: HARDWARE_FAULT auto-clears as soon as the underlying hardware
    // error disappears, so it's transient rather than critical.
    case "HARDWARE_FAULT":
      return "warning";
    // Soft faults — firmware self-clears after a 60 s cooldown and up to 5
    // automatic retries; CLEARERR is only required after a hard latch
    // (5 failed retries) or to retry immediately.
    case "OVERCURRENT":
      return "error";
    case "ELECTRODE_OPEN":
      return "warning";
    default:
      return "warning";
  }
}

function humanFault(f: string): string {
  const m: Record<string, string> = {
    HARDWARE_FAULT: "Hardware fault — auto-recovers when hardware clears",
    OVERCURRENT: "Electrode over-current — soft fault, auto-retry up to 5× (60 s cooldown)",
    ELECTRODE_OPEN: "Electrode open-circuit — soft fault, auto-retry up to 5× (60 s cooldown)",
  };
  return m[f] ?? f;
}

function alarmsFromStatus(deviceId: string, s: LiveStatus, ts: number): Alarm[] {
  const out: Alarm[] = [];
  if (s.fault && s.fault !== "NONE") {
    out.push({
      id: `${deviceId}-${s.fault}`,
      code: s.fault,
      message: humanFault(s.fault),
      severity: severityForFault(s.fault),
      timestamp: ts,
      deviceId,
    });
  }
  if (!s.batt_ok)
    out.push({ id: `${deviceId}-BATT`, code: "BATT_HW", message: "Battery hardware status not OK", severity: "warning", timestamp: ts, deviceId });
  if (!s.supply_ok)
    out.push({ id: `${deviceId}-SUPPLY`, code: "SUPPLY_HW", message: "Supply hardware status not OK", severity: "error", timestamp: ts, deviceId });
  if (!s.solar_ok)
    out.push({ id: `${deviceId}-SOLAR`, code: "SOLAR_HW", message: "Solar hardware status not OK", severity: "warning", timestamp: ts, deviceId });
  // v2.3: thermistor open/short is reported as TEMP_SENTINEL and is a
  // warning-only condition — electrolysis is permitted to continue.
  if (s.temp_c === TEMP_SENTINEL)
    out.push({ id: `${deviceId}-THERM`, code: "THERM_OPEN", message: "Water thermistor disconnected (warning only — does not block electrolysis)", severity: "warning", timestamp: ts, deviceId });
  return out;
}

// ---- Config defaults & validator (mirrors §8 error strings) ----------------
export const DEFAULT_CONFIG: NjordConfig = {
  chloride_mg_l: 250, gen_mg_per_c: 100, decay_mg_l_s: 5, buf_mg_l: 10,
  elec_id: 1, dev_id: 0, tank_l: 1000, fill_l_mm: 10, tank_max_mm: 1500,
  ph_x100: 700, cond_ms: 800, water_src: 1, cycle_s: 3600, cycle_c: 3600,
  target_ma: 500, target_cl_mg_l: 1, pwr_cfg: 1, elec_en: 1,
  pol_override: 0,
  name_suffix: "",
};

export function validateConfig(cfg: Partial<NjordConfig>): string | null {
  if (cfg.ph_x100 != null && (cfg.ph_x100 < 100 || cfg.ph_x100 > 1400))
    return "ph_x100 out of range [100..1400]";
  if (cfg.water_src != null && (cfg.water_src < 1 || cfg.water_src > 5))
    return "water_src must be 1..5";
  // Firmware v2.3+ tightened SETCFG validation bounds.
  if (cfg.cycle_s != null && (cfg.cycle_s < 1 || cfg.cycle_s > 86400))
    return "cycle_s out of range [1..86400]";
  if (cfg.cycle_c != null && (cfg.cycle_c < 1 || cfg.cycle_c > 4000))
    return "cycle_c out of range [1..4000]";
  if (cfg.target_ma != null && (cfg.target_ma < 1 || cfg.target_ma > 4000))
    return "target_ma out of range [1..4000]";
  if (cfg.gen_mg_per_c != null && (cfg.gen_mg_per_c < 1 || cfg.gen_mg_per_c > 10000))
    return "gen_mg_per_c out of range [1..10000]";
  if (cfg.chloride_mg_l != null && (cfg.chloride_mg_l < 0 || cfg.chloride_mg_l > 10000))
    return "chloride_mg_l out of range [0..10000]";
  if (cfg.decay_mg_l_s != null && (cfg.decay_mg_l_s < 0 || cfg.decay_mg_l_s > 10000))
    return "decay_mg_l_s out of range [0..10000]";
  if (cfg.buf_mg_l != null && (cfg.buf_mg_l < 0 || cfg.buf_mg_l > 10000))
    return "buf_mg_l out of range [0..10000]";
  if (cfg.target_cl_mg_l != null && (cfg.target_cl_mg_l < 0 || cfg.target_cl_mg_l > 100))
    return "target_cl_mg_l out of range [0..100]";
  if (cfg.pwr_cfg != null && (cfg.pwr_cfg < 1 || cfg.pwr_cfg > 4))
    return "pwr_cfg must be 1..4";
  if (cfg.elec_en != null && cfg.elec_en !== 0 && cfg.elec_en !== 1)
    return "elec_en must be 0 or 1";
  if (cfg.pol_override != null && (cfg.pol_override < 0 || cfg.pol_override > 2))
    return "pol_override must be 0 (switch), 1 (pol0) or 2 (pol1)";
  return null;
}

// ---- Binary helpers ---------------------------------------------------------
const td = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;
const te = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

function dvToText(dv: DataView): string {
  if (!td) return "";
  return td.decode(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)).trim();
}

// ---- v2.0 CSV parsers ------------------------------------------------------
function parseLiveStatusCsv(text: string): LiveStatus | null {
  // API v2.6+ tagged format: key=value pairs (keys are short, see firmware
  // legend). Self-describing — immune to field-order drift between firmware
  // and host. Detect it by the presence of '=' in the payload and dispatch
  // accordingly. Pre-v2.6 devices keep speaking the positional form below.
  if (text.includes("=")) return parseLiveStatusKeyed(text);
  return parseLiveStatusPositional(text);
}

/** Parse a key=value,key=value,... payload into a Map<string,string>. */
function parseKeyedCsv(text: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const tok of text.split(",")) {
    const eq = tok.indexOf("=");
    if (eq <= 0) continue;
    m.set(tok.slice(0, eq).trim(), tok.slice(eq + 1).trim());
  }
  return m;
}

// BuildLiveStatusCsv() (njord_gatt.cpp) writes `st=%s` from
// AppSM_GetStateStr() (AppStateMachine.cpp), which returns the abbreviated
// "ELEC" for the active state (BOOT/IDLE/ERROR are spelled out in full) —
// not "ELECTROLYSIS_ACTIVE", which is what the rest of this app (and the
// DeviceStateName type) expects. Every `status.state === "ELECTROLYSIS_ACTIVE"`
// check (cycleRing.ts, progress.ts) was silently always false, e.g. the cycle
// ring's timer/percentage looked permanently frozen even while a cycle was
// genuinely running. Normalize on the way in so the rest of the app can keep
// using the readable full name.
const STATE_ALIASES: Record<string, string> = { ELEC: "ELECTROLYSIS_ACTIVE" };

/** API v2.6+ keyed LiveStatus parser. Key legend matches firmware
 *  BuildLiveStatusCsv() in njord_gatt.cpp (see BLE Developer Guide §6). */
function parseLiveStatusKeyed(text: string): LiveStatus | null {
  const kv = parseKeyedCsv(text);
  if (kv.size === 0) return null;
  const num = (k: string) => {
    const v = kv.get(k);
    if (v == null || v === "") return 0;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  };
  const bool = (k: string) => kv.get(k) === "1";
  const supplyMv = num("umv");
  const cruiseDutyPm = num("dpm");
  const rawState = kv.get("st") ?? "";
  return {
    state:      STATE_ALIASES[rawState] ?? rawState,
    fault:      kv.get("flt") ?? "NONE",
    elec_on:    bool("eon"),
    elec_ma:    num("ema"),
    cycle_avg_ma: 0,
    batt_mv:    num("bmv"),
    solar_mv:   num("smv"),
    supply_mv:  supplyMv,
    temp_c:     num("tc"),
    deliv_uc:   num("duc"),
    target_uc:  num("tuc"),
    phase:      kv.get("ph") ?? "",
    cruise_duty_pm: cruiseDutyPm,
    polarity:   bool("pol"),
    batt_ok:    bool("bok"),
    solar_ok:   bool("sok"),
    supply_ok:  bool("uok"),
    solar_ctrl: bool("sct"),
    batt_conn:    bool("bcn"),
    solar_conn:   bool("scn"),
    stepup_on:    bool("spu"),
    solar_chg_on: bool("sch"),
    time:         kv.get("tm") ?? "00:00:00",
    inad_cur:         false,
    // API v2.8+: firmware reports seconds elapsed in current cycle as `cds`.
    // Older firmwares omit it (defaults to 0) and CycleRing falls back to
    // its host-side stopwatch — broken for cycles where no current ever
    // flows, but no worse than the pre-v2.8 behaviour.
    phase_elapsed_ms: num("cms") > 0 ? num("cms") : num("cds") * 1000,
    // API v2.10+: device reports total cycle ON-time in ms as `ctm` so the
    // cycle ring is fully device-authoritative (no dependency on a separately
    // read Config). 0 on older firmware → CycleRing falls back to cfg.cycle_s.
    phase_total_ms:   num("ctm"),
    // BUG FIX: this was hardcoded to 0, which meant Home's "Current watt"
    // metric (power.ts wattsFromStatus) was always 0 and never updated.
    // elec_mv has no dedicated wire key; it's derived the same way the
    // positional (v2.0) parser's doc comment always described:
    // cruise_duty_pm (‰) * supply_mv / 1000.
    elec_mv:          Math.round((cruiseDutyPm * supplyMv) / 1000),
    cycle_duration_s: num("cds"),
    target_ma:        0,
    cycle_count:      0,
    reboot_count:     0,
    batch_accum_uc:   0,
    charge_debt_c:       num("dbc"),
    debt_removal_active: bool("dbm"),
    raw_csv: text,
  };
}

function parseLiveStatusPositional(text: string): LiveStatus | null {
  const f = text.split(",");
  // API v2.0 LiveStatus — 24 positional CSV fields (BLE Developer Guide §6).
  // Charges are already in µC on the wire. UI types still carry the v2.3/v2.4
  // fields (cycle_avg_ma, elec_mv, cycle_count, charge_debt_c, …) so we keep
  // those properties on the returned object filled with zero defaults until
  // the device-side rebuild surfaces them again.
  if (f.length < 24) return null;
  const num = (i: number) => parseInt(f[i], 10) || 0;
  const supplyMv = num(6);
  const cruiseDutyPm = num(11);
  return {
    state:      f[0],
    fault:      f[1],
    elec_on:    f[2] === "1",
    elec_ma:    num(3),
    cycle_avg_ma: 0,
    batt_mv:    num(4),
    solar_mv:   num(5),
    supply_mv:  supplyMv,
    temp_c:     parseInt(f[7], 10) || 0,
    deliv_uc:   num(8),
    target_uc:  num(9),
    phase:      f[10],
    // v2.0 wire field 11 is the instantaneous `duty_pm`; the UI still keys
    // off `cruise_duty_pm`, so we surface it under that name until the
    // firmware re-introduces the cruise average.
    cruise_duty_pm: cruiseDutyPm,
    polarity:   f[12] === "1",
    batt_ok:    f[13] === "1",
    solar_ok:   f[14] === "1",
    supply_ok:  f[15] === "1",
    solar_ctrl: f[16] === "1",
    batt_conn:    f[17] === "1",
    solar_conn:   f[18] === "1",
    stepup_on:    f[19] === "1",
    solar_chg_on: f[20] === "1",
    time:         `${f[21]}:${f[22]}:${f[23]}`,
    // v2.3/v2.4 extras — not present in v2.0 wire payload.
    inad_cur:         false,
    phase_elapsed_ms: 0,
    phase_total_ms:   0,
    elec_mv:          Math.round((cruiseDutyPm * supplyMv) / 1000),
    cycle_duration_s: 0,
    target_ma:        0,
    cycle_count:      0,
    reboot_count:     0,
    batch_accum_uc:   0,
    charge_debt_c:       0,
    debt_removal_active: false,
    raw_csv: text,
  };
}

function parseConfigCsv(text: string): NjordConfig | null {
  // API v2.6+ tagged form. Keys mirror firmware BuildConfigCsv() in
  // njord_gatt.cpp (see BLE Developer Guide §7).
  if (text.includes("=")) {
    const kv = parseKeyedCsv(text);
    if (kv.size === 0) return null;
    const num = (k: string) => {
      const v = kv.get(k);
      if (v == null || v === "") return Number.NaN;
      return parseInt(v, 10);
    };
    const c = {
      chloride_mg_l:  num("cl"),
      gen_mg_per_c:   num("gmc"),
      decay_mg_l_s:   num("dec"),
      buf_mg_l:       num("buf"),
      elec_id:        num("eid"),
      dev_id:         num("did"),
      tank_l:         num("tnk"),
      fill_l_mm:      num("fmm"),
      tank_max_mm:    num("tmm"),
      ph_x100:        num("phx"),
      cond_ms:        num("cnd"),
      water_src:      num("wsr"),
      cycle_s:        num("cys"),
      cycle_c:        num("cyc"),
      target_ma:      num("tma"),
      target_cl_mg_l: num("tcl"),
      pwr_cfg:        num("pcf"),
      elec_en:        num("een"),
    };
    if (Object.values(c).some(Number.isNaN)) return null;
    // name_suffix (key `nm`, API v2.12) is a string, and pol_override (key
    // `pov`, API v2.13) is optional, so both are read separately from the
    // numeric block above (which NaN-rejects the whole frame).
    const pov = kv.get("pov");
    return {
      ...c,
      pol_override: pov != null && pov !== "" ? parseInt(pov, 10) : 0,
      name_suffix: kv.get("nm") ?? "",
    };
  }
  // Pre-v2.6 positional form.
  const f = text.split(",").map((x) => parseInt(x, 10));
  if (f.length < 18 || f.some((n) => Number.isNaN(n))) return null;
  return {
    chloride_mg_l: f[0],  gen_mg_per_c:   f[1],  decay_mg_l_s: f[2],
    buf_mg_l:      f[3],  elec_id:        f[4],  dev_id:       f[5],
    tank_l:        f[6],  fill_l_mm:      f[7],  tank_max_mm:  f[8],
    ph_x100:       f[9],  cond_ms:        f[10], water_src:    f[11],
    cycle_s:       f[12], cycle_c:        f[13], target_ma:    f[14],
    target_cl_mg_l:f[15], pwr_cfg:        f[16], elec_en:      f[17],
    pol_override:  0,
    name_suffix:   "",
  };
}

function parseDeviceInfoCsv(text: string): DeviceInfo | null {
  // API v2.6+ tagged form. Keys: fw, hw, api, did, uid, eid, feat
  // (see firmware njord_gatt.cpp BuildDeviceInfoCsv).
  if (text.includes("=")) {
    const kv = parseKeyedCsv(text);
    if (kv.size === 0) return null;
    const intOr0 = (k: string) => {
      const v = kv.get(k);
      const n = v != null ? parseInt(v, 10) : 0;
      return Number.isFinite(n) ? n : 0;
    };
    return {
      fw:        kv.get("fw") ?? "",
      hw:        kv.get("hw") ?? "",
      api:       kv.get("api") ?? "",
      device_id: intOr0("did"),
      unique_id: intOr0("uid"),
      elec_id:   intOr0("eid"),
      features:  intOr0("feat"),
    };
  }
  // Pre-v2.6 positional form.
  const f = text.split(",");
  if (f.length < 7) return null;
  return {
    fw:        f[0],
    hw:        f[1],
    api:       f[2],
    device_id: parseInt(f[3], 10) || 0,
    unique_id: parseInt(f[4], 10) || 0,
    elec_id:   parseInt(f[5], 10) || 0,
    features:  parseInt(f[6], 10) || 0,
  };
}

/** Parse the LogMeta characteristic CSV: 4 fields
 *  `bytes_used, bytes_free, pct_used, chunk_payload_max`. */
function parseLogMetaCsv(text: string): LogMeta | null {
  // API v2.6+ tagged form. Keys: bu, bf, pu, cs.
  if (text.includes("=")) {
    const kv = parseKeyedCsv(text);
    if (kv.size === 0) return null;
    const num = (k: string) => {
      const v = kv.get(k);
      const n = v != null ? parseInt(v, 10) : Number.NaN;
      return Number.isFinite(n) ? n : Number.NaN;
    };
    const bu = num("bu"), bf = num("bf"), pu = num("pu"), cs = num("cs");
    if ([bu, bf, pu].some(Number.isNaN)) return null;
    return {
      bytes_used:        bu,
      bytes_free:        bf,
      pct_used:          pu,
      chunk_payload_max: Number.isFinite(cs) ? cs : 180,
    };
  }
  // Pre-v2.6 positional form.
  const f = text.split(",").map((x) => parseInt(x, 10));
  if (f.length < 4 || f.slice(0, 4).some(Number.isNaN)) return null;
  return {
    bytes_used:        f[0],
    bytes_free:        f[1],
    pct_used:          f[2],
    chunk_payload_max: f[3] || 180,
  };
}

// ---- v2.0 command name + payload encoder -----------------------------------
// Maps the logical app-level command names to the on-the-wire `<id> CMDNAME args`
// strings defined in BLE Developer Guide §5.
function encodeCommand(reqId: number, cmd: string, data?: unknown): string | { error: string } {
  const head = (name: string, args = ""): string =>
    args ? `${reqId} ${name} ${args}` : `${reqId} ${name}`;
  switch (cmd) {
    case "get_status":          return head("GETSTATUS");
    case "get_config":          return head("GETCFG");
    case "start_treatment":     return head("START");
    case "stop_treatment":      return head("STOP");
    case "clear_error":         return head("CLEARERR");
    case "factory_reset":       return head("FACTORYRESET");
    case "request_log_info":    return head("GETLOGINFO");
    case "cancel_log_download": return head("CANCELLOGDL");
    case "delete_logs":         return head("DELLOGS");
    case "reset_batch":         return head("RESETBATCH");
    case "start_batch":         return head("STARTBATCH");
    case "stop_batch":          return head("STOPBATCH");
    case "stop_timer":          return head("STOPTIMER");
    case "get_timer":           return head("GETTIMER");
    case "clear_fault":         return head("CLEARFAULT");
    // Charge-debt accumulator commands (firmware API v2.4+). The device
    // speaks STARTDEBT / STOPDEBT / RESETDEBT on the command characteristic.
    case "debt_removal": {
      const d = (data ?? {}) as { on?: boolean | number };
      return head(d.on ? "STARTDEBT" : "STOPDEBT");
    }
    case "reset_debt":          return head("RESETDEBT");
    // Device name suffix (firmware API v2.12+). Empty suffix clears it back to
    // the default "NjordAqua" advertised name; otherwise the device advertises
    // "Njord-<suffix>". Charset [A-Za-z0-9 _-], max 12 chars (enforced here and
    // re-validated by the firmware SETNAME handler).
    case "set_name": {
      const d = (data ?? {}) as { suffix?: string };
      const suffix = (d.suffix ?? "").trim();
      if (suffix.length > 12) return { error: "name too long (max 12)" };
      if (suffix && !/^[A-Za-z0-9 _-]+$/.test(suffix)) {
        return { error: "invalid char in name (allowed: A-Z a-z 0-9 space _ -)" };
      }
      return head("SETNAME", suffix);
    }
    // The following commands were introduced in API v2.1+ and are not part
    // of the v2.0 wire protocol the device currently speaks. Surface a
    // clear error so UI buttons fail loudly while we rebuild slowly.
    case "reboot":              return head("REBOOT");
    // Clear the device's on-chip BLE security database (stored bond / LTK).
    // The firmware runs Just-Works with bonding disabled, so this is normally a
    // no-op, but it lets the user wipe a stale bond left over from an older
    // MITM-pairing firmware without a factory reset.
    case "remove_bond":         return head("REMOVEBOND");
    case "step_up":
      return { error: `${cmd} not supported on API v2.0 firmware` };
    case "set_timer": {
      const d = (data ?? {}) as { seconds?: number };
      const s = Math.max(0, Math.round(Number(d.seconds ?? 0)));
      if (!Number.isFinite(s)) return { error: "set_timer requires seconds" };
      return head("SETTIMER", String(s));
    }
    case "set_charging": {
      const d = (data ?? {}) as { on?: boolean | number };
      const on = d.on ? 1 : 0;
      return head("SETCHARGING", String(on));
    }
    case "sonar_shot":          return head("SONARSHOT");
    case "sonar_raw":           return head("SONARRAW");
    // Receive PGA gain index (0-7 → 1,2,4,5,8,10,16,32×) and receive blanking
    // dead time in µs. Both apply immediately on the device and persist until
    // its next reboot. Firmware: SONARGAIN / SONARBLANK.
    case "sonar_gain": {
      const d = (data ?? {}) as { index?: number };
      const idx = Math.round(Number(d.index ?? 0));
      if (!Number.isFinite(idx) || idx < 0 || idx > 7) {
        return { error: "gain index must be 0-7" };
      }
      return head("SONARGAIN", String(idx));
    }
    case "sonar_blank": {
      const d = (data ?? {}) as { us?: number };
      const us = Math.round(Number(d.us ?? 0));
      if (!Number.isFinite(us) || us < 0) {
        return { error: "blanking must be ≥0 µs" };
      }
      return head("SONARBLANK", String(Math.min(us, 3000)));
    }
    // Multi-shot median measurement (firmware SONARSTATS). Runs <count> blocking
    // captures and returns "median,mean,stddev,count" — the median rejects
    // outliers far better than a single shot.
    case "sonar_stats": {
      const d = (data ?? {}) as { count?: number };
      const count = Math.round(Number(d.count ?? 32));
      if (!Number.isFinite(count) || count < 1) {
        return { error: "count must be ≥1" };
      }
      return head("SONARSTATS", String(Math.min(count, 256)));
    }
    // Robust two-level median measurement (firmware SONARROBUST). 5 readings of
    // 50 captures each → median per reading → median of the reading-medians.
    // Returns "median,stddev,flag,groups,per_group".
    case "sonar_robust":        return head("SONARROBUST");
    // ADC capture-window length in samples (firmware SONARWIN). Longer windows
    // reach farther (max distance ≈ samples × sample-time) at the cost of a
    // longer capture.
    case "sonar_window": {
      const d = (data ?? {}) as { samples?: number };
      const samples = Math.round(Number(d.samples ?? 256));
      if (!Number.isFinite(samples) || samples < 1) {
        return { error: "samples must be ≥1" };
      }
      return head("SONARWIN", String(Math.min(samples, 2048)));
    }
    // Echo peak-detection mode (firmware SONARSMOOTH). 1 = envelope-smoothed
    // first-threshold (default), 0 = raw global-max above baseline.
    case "sonar_smooth": {
      const d = (data ?? {}) as { on?: boolean | number };
      return head("SONARSMOOTH", d.on ? "1" : "0");
    }
    // Quiet-capture gating (firmware SONARQUIET). 1 = pause H-bridge
    // electrolysis during each capture so its switching noise stays out of the
    // ADC samples (default), 0 = leave it running for comparison.
    case "sonar_quiet": {
      const d = (data ?? {}) as { on?: boolean | number };
      return head("SONARQUIET", d.on ? "1" : "0");
    }
    // Transmit burst length in drive cycles (firmware SONARBURST). More cycles
    // drive the resonant transducer harder → stronger ping → larger echo.
    case "sonar_burst": {
      const d = (data ?? {}) as { cycles?: number };
      const cycles = Math.round(Number(d.cycles ?? 32));
      if (!Number.isFinite(cycles) || cycles < 1) {
        return { error: "cycles must be ≥1" };
      }
      return head("SONARBURST", String(Math.min(cycles, 40)));
    }
    case "set_config": {
      const d = (data ?? {}) as Record<string, unknown>;
      const pairs = Object.entries(d)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${typeof v === "boolean" ? (v ? 1 : 0) : v}`)
        .join(" ");
      if (!pairs) return { error: "set_config requires at least one key" };
      return head("SETCFG", pairs);
    }
    case "sync_time": {
      const d = (data ?? {}) as { h?: number; m?: number; s?: number; day?: number; mon?: number; yr?: number };
      if ([d.h, d.m, d.s, d.day, d.mon, d.yr].some((v) => v == null)) {
        return { error: "sync_time requires h m s day mon yr" };
      }
      return head("TIME", `${d.h} ${d.m} ${d.s} ${d.day} ${d.mon} ${d.yr}`);
    }
    case "start_log_download": {
      const d = (data ?? {}) as { from_ts?: number; to_ts?: number };
      const args = [
        d.from_ts != null ? `from=${d.from_ts}` : "",
        d.to_ts   != null ? `to=${d.to_ts}`   : "",
      ].filter(Boolean).join(" ");
      return head("STARTLOGDL", args);
    }
    default:
      // Pass-through: send as raw command name in upper case.
      return head(cmd.toUpperCase());
  }
}

/** Parse a Response notification: `<id> OK`, `<id> OK <data...>`, or `<id> ERR <reason>`. */
function parseResponse(text: string): { id: number; ok: boolean; data?: string; error?: string } | null {
  const trimmed = text.trim();
  const sp1 = trimmed.indexOf(" ");
  if (sp1 < 0) return null;
  const id = parseInt(trimmed.slice(0, sp1), 10);
  if (Number.isNaN(id)) return null;
  const rest = trimmed.slice(sp1 + 1).trim();
  if (rest === "OK") return { id, ok: true };
  if (rest.startsWith("OK ")) return { id, ok: true, data: rest.slice(3).trim() };
  if (rest.startsWith("ERR")) return { id, ok: false, error: rest.replace(/^ERR\s*/, "") };
  return { id, ok: false, error: rest };
}

/** CRC-16/IBM (reflected, poly 0xA001, init 0xFFFF) — payload only. */
function crc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let b = 0; b < 8; b++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc & 0xffff;
}

/** Parse one reassembled flash-log text blob (UTF-8, newline-separated CSV
 *  records). Each record is dispatched by its first comma-delimited token:
 *
 *    Tag (v2.5+)  Legacy   Description
 *    -----------  -------  --------------------------------------------------
 *    T            TEL      Telemetry sample (every 10 s)
 *    S            STT      State machine transition
 *    O            SON      Sonar measurement
 *    B            BATCH    Synthetic batch summary (always seq=0 of download)
 *
 *  Lines that don't match any known tag or have too few fields are silently
 *  dropped — chunk boundaries can leave fragments at the head or tail of the
 *  reassembled blob. */
function parseLogText(text: string): { entries: LogEntry[]; batch: BatchStats | null } {
  const out: LogEntry[] = [];
  let batch: BatchStats | null = null;
  const lines = text.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const f = line.split(",");
    const tag = f[0];
    if ((tag === "B" || tag === "BATCH") && f.length >= 10) {
      // v2.5+: B,samples,cycles,avgBat,avgSup,avgSol,avgElec,avgTemp,avgDist,accumUC,
      //        reboot_count,lifetime_cycles,lifetime_uc       (13 fields)
      // v2.0:  BATCH,...  (10 fields, no lifetime counters)
      const n = (i: number) => parseInt(f[i], 10);
      if (!Number.isNaN(n(1))) {
        batch = {
          samples:    n(1),
          cycles:     n(2),
          avgBat_mv:  n(3),
          avgSup_mv:  n(4),
          avgSol_mv:  n(5),
          avgElec_ma: n(6),
          avgTemp_c:  n(7),
          avgDist_mm: n(8),
          // BATCH `accumUC` is already in µC on the v2.0 wire.
          accumUC:    n(9),
          updatedAt:  Date.now(),
        };
      }
    } else if ((tag === "T" || tag === "TEL") && f.length >= 12) {
      // T v2.9 (BLE Developer Guide §9): one record per completed cycle
      // (10 s periodic only while IDLE / ERROR).
      //   T,ts,elec_ma,bat_mv,sol_mv,sup_mv,temp_c,duty_pm,
      //     del_uc,target_uc,target_ma,polarity
      //     [,debt_uc,debt_removed_uc                       ← v2.4]
      //     [,cycle_count,reboot_count,cycle_dur_s          ← v2.7]
      //     [,b_avg_bat_mv,b_avg_sup_mv,b_avg_sol_mv,
      //       b_avg_elec_ma,b_avg_temp_c,b_accum_uc,b_cycles ← v2.9]
      // Older firmware stops earlier; missing trailing fields are treated as 0.
      // Charges are µC on the wire; `_c` fields below are converted to Coulombs.
      const elecMa = parseInt(f[2], 10) || 0;
      const dutyPm = parseInt(f[7], 10) || 0;
      const ucToC = (i: number) =>
        f.length > i ? (parseInt(f[i], 10) || 0) / 1_000_000 : 0;
      const intAt = (i: number) => (f.length > i ? (parseInt(f[i], 10) || 0) : 0);
      const e: TelemetryLogEntry = {
        type: "TEL",
        ts:             parseInt(f[1], 10),
        battery_mv:     parseInt(f[3], 10) || 0,
        solar_mv:       parseInt(f[4], 10) || 0,
        supply_mv:      parseInt(f[5], 10) || 0,
        temp_c:         parseInt(f[6], 10) || 0,
        delivered_uc:   parseInt(f[8], 10) || 0,
        target_uc:      parseInt(f[9], 10) || 0,
        target_ma:      parseInt(f[10], 10) || 0,
        polarity:       parseInt(f[11], 10) || 0,
        // Synthesised fields — v2.x flash log doesn't carry these in TEL.
        cycle_avg_ma:   elecMa,
        cruise_duty_pm: dutyPm,
        elec_mv:        0,
        // v2.7 trailing fields (lifetime cycle/reboot counters + cycle duration).
        cycle_count:    intAt(14),
        reboot_count:   intAt(15),
        cycle_dur_s:    intAt(16),
        // v2.4 charge-debt accounting fields (converted µC → C).
        charge_debt_c:  ucToC(12),
        debt_removed_c: ucToC(13),
        // v2.9 batch running-average snapshot. Zero on pre-v2.9 firmware.
        batch_avg_batt_mv:   intAt(17),
        batch_avg_supply_mv: intAt(18),
        batch_avg_solar_mv:  intAt(19),
        batch_avg_elec_ma:   intAt(20),
        batch_avg_temp_c:    intAt(21),
        batch_accum_c:       ucToC(22),
        batch_cycles:        intAt(23),
      };
      if (!Number.isNaN(e.ts)) out.push(e);
    } else if ((tag === "S" || tag === "STT") && f.length >= 7) {
      // S v2.5: charge fields are µC on the wire.
      //   S,ts,state,fault,del_uc,target_uc,dur_s
      const e: StateLogEntry = {
        type: "STT",
        ts:           parseInt(f[1], 10),
        state:        parseInt(f[2], 10),
        fault:        parseInt(f[3], 10),
        delivered_uc: parseInt(f[4], 10) || 0,
        target_uc:    parseInt(f[5], 10) || 0,
        duration_s:   parseInt(f[6], 10),
      };
      if (!Number.isNaN(e.ts)) out.push(e);
    } else if ((tag === "O" || tag === "SON") && f.length >= 5) {
      // O v2.5: O,ts,dist_mm,peak_delta,baseline
      const e: SonarLogEntry = {
        type: "SON",
        ts:         parseInt(f[1], 10),
        dist_mm:    parseInt(f[2], 10),
        peak_delta: parseInt(f[3], 10),
        baseline:   parseInt(f[4], 10),
      };
      if (!Number.isNaN(e.ts)) out.push(e);
    }
  }
  return { entries: out, batch };
}

// ---- Defaults for a freshly-connected device -------------------------------
function emptyStatus(): LiveStatus {
  return {
    state: "—", fault: "NONE",
    elec_on: false, elec_ma: 0, batt_mv: 0, solar_mv: 0, supply_mv: 0,
    cycle_avg_ma: 0,
    temp_c: 0, deliv_uc: 0, target_uc: 0,
    phase: "", polarity: false,
    cruise_duty_pm: 0,
    batt_ok: true, solar_ok: true, supply_ok: true, solar_ctrl: false,
    batt_conn: false, solar_conn: false, stepup_on: false, solar_chg_on: false,
    time: "--:--:--",
    inad_cur: false,
    phase_elapsed_ms: 0,
    phase_total_ms: 0,
    elec_mv: 0,
    cycle_duration_s: 0,
    target_ma: 0,
    cycle_count: 0,
    reboot_count: 0,
    batch_accum_uc: 0,
    charge_debt_c: 0,
    debt_removal_active: false,
  };
}
function emptyInfo(): DeviceInfo {
  return { fw: "—", hw: "—", api: "—", device_id: 0, unique_id: 0, elec_id: 0, features: 0 };
}

// =============================================================================
// Store
// =============================================================================
type Listener = () => void;

interface DeviceRuntime {
  btDevice: BluetoothDevice;
  server?: BluetoothRemoteGATTServer;
  cmdChar?: BluetoothRemoteGATTCharacteristic;
  statusChar?: BluetoothRemoteGATTCharacteristic;
  configChar?: BluetoothRemoteGATTCharacteristic;
  logMetaChar?: BluetoothRemoteGATTCharacteristic;
  sonarChar?: BluetoothRemoteGATTCharacteristic;
  /** True once SonarDbg notifications have been armed (CCCD written) on the
   *  current connection. Armed once at connect; consecutive shots reuse it
   *  instead of re-writing the CCCD every time (which churned the
   *  subscription and made back-to-back readings drop). Reset on disconnect. */
  sonarArmed?: boolean;
  pending: Map<number, (r: { ok: boolean; data?: string; error?: string }) => void>;
  log?: {
    transferId: number;
    total: number;
    received: Map<number, Uint8Array>;
  };
  /** transferId of the most recently completed log download. Used to ignore
   *  late/duplicate retransmitted chunks that arrive after completion, which
   *  would otherwise recreate the buffer and reset the progress bar to 1. */
  lastCompletedLogTransferId?: number;
  gattQueue: Promise<unknown>;
  autoReconnect: boolean;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  reconnectAttempts: number;
  reconnecting: boolean;
  /** Consecutive watchdog-forced reconnects that have NOT yet been followed
   *  by a LiveStatus frame. Reset to 0 in applyStatus(). Caps how many times
   *  the liveness watchdog will physically cycle the link before giving up. */
  staleReconnects: number;
}

export interface SonarSample {
  t: number;
  dist_mm: number;
  baseline: number;
  peak_delta: number;
  peak_idx: number;
  sample_count: number;
}

export interface SonarRaw {
  t: number;
  meta: SonarSample;
  samples: number[]; // raw ADC uint16 values
}

export interface SonarStats {
  t: number;
  median_mm: number;
  mean_mm: number;
  stddev_mm: number;
  count: number;
}

export interface SonarRobust {
  t: number;
  median_mm: number;
  stddev_mm: number;
  valid: boolean;
  groups: number;
  per_group: number;
}

class Store {
  devices: Device[] = [];
  telemetry: Record<string, TelemetrySample[]> = {};
  sonar: Record<string, SonarSample | undefined> = {};
  sonarHistory: Record<string, SonarSample[]> = {};
  sonarRaw: Record<string, SonarRaw | undefined> = {};
  sonarStats: Record<string, SonarStats | undefined> = {};
  sonarRobust: Record<string, SonarRobust | undefined> = {};
  // chunk accumulator per device for SONARRAW transfers.
  // Pre-armed by the SONARRAW response (which carries metadata + sample count)
  // before any chunk arrives. `total` and `count` are 0 until armed.
  private sonarAccum: Record<
    string,
    {
      total: number;
      count: number;
      received: number;
      samples: Uint16Array;
      meta: { dist_mm: number; baseline: number; peak_delta: number; peak_idx: number };
    }
  > = {};
  logs: Record<string, LogEntry[]> = {};
  logMeta: Record<string, LogMeta> = {};
  batchStats: Record<string, BatchStats> = {};
  logProgress: Record<
    string,
    { total: number; received: number; startedAt: number; completedAt?: number; cancelled?: boolean }
  > = {};
  configs: Record<string, NjordConfig> = {};
  commands: CommandEntry[] = [];
  reqIdSeq = 1;

  rt: Map<string, DeviceRuntime> = new Map();
  listeners = new Set<Listener>();
  pairing = false;
  private pairingStartedAt = 0;
  private pairingResetTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Restore previously paired devices on first construction (browser only).
    // We populate the device list immediately from localStorage so cards
    // appear right away as offline, then try `navigator.bluetooth.getDevices()`
    // (Chromium) to silently re-establish GATT links without a user gesture.
    if (typeof window !== "undefined") {
      // Defer to next tick so React listeners can subscribe before notify().
      setTimeout(() => { this.hydrate().catch(() => {}); }, 0);
      // Liveness watchdog: a device reboot can leave the OS GATT link in a
      // "connected" zombie state (no `gattserverdisconnected` event), so
      // notifications stop and writes go nowhere yet nothing schedules a
      // reconnect. Periodically force a teardown+reconnect when LiveStatus
      // has gone silent — this is what closing/reopening the app does.
      this.watchdogTimer = setInterval(() => this.runWatchdog(), 2000);
    }
  }

  subscribe(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  notify() { this.listeners.forEach((l) => l()); }

  // ---- Persistence of paired devices (localStorage) ---------------------
  private static STORAGE_KEY = "njord.pairedDevices.v1";

  private persist() {
    if (typeof localStorage === "undefined") return;
    try {
      const data = this.devices.map((d) => ({
        id: d.id, name: d.name, location: d.location, info: d.info,
      }));
      localStorage.setItem(Store.STORAGE_KEY, JSON.stringify(data));
    } catch { /* quota / private-mode — ignore */ }
  }

  private loadPersisted(): Array<{ id: string; name: string; location: string; info: DeviceInfo }> {
    if (typeof localStorage === "undefined") return [];
    try {
      const raw = localStorage.getItem(Store.STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  private async hydrate() {
    const persisted = this.loadPersisted();
    // Pre-populate the device list as offline so the UI shows the known
    // fleet immediately, even if Web Bluetooth is unavailable in this
    // browser session (Safari, missing permissions, etc.).
    for (const p of persisted) {
      if (this.devices.find((d) => d.id === p.id)) continue;
      this.devices.push({
        id: p.id,
        name: p.name || "NjordAqua",
        location: p.location || "—",
        online: false, reconnecting: false, rssi: 0, lastUpdate: 0, uptimeSec: 0,
        packet_loss_pct: 0, tx_count: 0, rx_count: 0, reconnects: 0,
        info: p.info ?? emptyInfo(),
        status: emptyStatus(),
        alarms: [],
      });
      this.telemetry[p.id] = [];
      this.logs[p.id] = [];
      this.logMeta[p.id] = { bytes_used: 0, bytes_free: 0, pct_used: 0, chunk_payload_max: 180 };
      this.configs[p.id] = { ...DEFAULT_CONFIG };
    }
    if (persisted.length > 0) this.notify();

    // Chromium exposes `navigator.bluetooth.getDevices()` — it returns every
    // BluetoothDevice the user has previously granted permission to, with no
    // user-gesture requirement. We can transparently re-attach to each one.
    const bt = (navigator as Navigator & { bluetooth?: { getDevices?: () => Promise<BluetoothDevice[]> } }).bluetooth;
    if (!bt || typeof bt.getDevices !== "function") return;
    let known: BluetoothDevice[] = [];
    try { known = await bt.getDevices(); }
    catch (e) { console.debug("[njord] getDevices() failed", e); return; }
    for (const btDevice of known) {
      const id = btDevice.id || btDevice.name || "";
      if (!id) continue;
      if (this.rt.has(id)) continue;
      // attach() will create the runtime, then connect() will try to bring
      // the GATT link up — most attempts fail silently (out of range, off)
      // and exponential-backoff reconnect takes over from there.
      this.attach(btDevice).catch((e) => console.debug("[njord] auto-reattach failed", e));
    }
  }

  isSupported(): boolean {
    return typeof navigator !== "undefined" && !!(navigator as Navigator & { bluetooth?: unknown }).bluetooth;
  }

  recoverPairingAfterResume() {
    if (!this.pairing || (this.pairingStartedAt > 0 && Date.now() - this.pairingStartedAt < 1000)) return;
    this.setPairing(false);
  }

  private setPairing(active: boolean) {
    if (this.pairingResetTimer) {
      clearTimeout(this.pairingResetTimer);
      this.pairingResetTimer = null;
    }
    this.pairing = active;
    this.pairingStartedAt = active ? Date.now() : 0;
    if (active) {
      this.pairingResetTimer = setTimeout(() => {
        if (!this.pairing || Date.now() - this.pairingStartedAt < 30000) return;
        this.setPairing(false);
      }, 30000);
    }
    this.notify();
  }

  async pair(): Promise<Device | null> {
    if (!this.isSupported()) {
      throw new Error("Web Bluetooth not available. Use Chrome/Edge over HTTPS, and open this page in a new tab (not inside the preview iframe).");
    }
    this.setPairing(true);
    try {
      const bt = (navigator as unknown as { bluetooth: { requestDevice(opts: RequestDeviceOptions): Promise<BluetoothDevice> } }).bluetooth;
      const btDevice = await bt.requestDevice({
        // "Njord" matches both the default "NjordAqua" name and any
        // user-suffixed "Njord-<suffix>" advertised name (firmware API v2.12+).
        filters: [{ services: [SERVICE_UUID] }, { namePrefix: "Njord" }],
        optionalServices: [SERVICE_UUID],
      });
      return await this.attach(btDevice);
    } finally {
      this.setPairing(false);
    }
  }

  private async attach(btDevice: BluetoothDevice): Promise<Device> {
    const id = btDevice.id || (btDevice.name ?? `dev-${Date.now()}`);
    let existing = this.devices.find((d) => d.id === id);
    if (!existing) {
      existing = {
        id, name: btDevice.name ?? "NjordAqua", location: "—",
        online: false, reconnecting: false, rssi: 0, lastUpdate: 0, uptimeSec: 0,
        packet_loss_pct: 0, tx_count: 0, rx_count: 0, reconnects: 0,
        info: emptyInfo(), status: emptyStatus(), alarms: [],
      };
      this.devices.push(existing);
      this.telemetry[id] = [];
      this.logs[id] = [];
      this.logMeta[id] = { bytes_used: 0, bytes_free: 0, pct_used: 0, chunk_payload_max: 180 };
      this.configs[id] = { ...DEFAULT_CONFIG };
    }
    let rt = this.rt.get(id);
    if (!rt) {
      rt = {
        btDevice,
        pending: new Map(),
        gattQueue: Promise.resolve(),
        autoReconnect: true,
        reconnectAttempts: 0,
        reconnecting: false,
        staleReconnects: 0,
      };
      this.rt.set(id, rt);
      btDevice.addEventListener("gattserverdisconnected", () => this.handleDisconnect(id));
    }
    try {
      await this.connect(id);
    } catch (e) {
      // Connection failed (device out of range, off, or denied). Keep the
      // runtime so scheduled reconnects can keep trying in the background.
      if (rt.autoReconnect) this.scheduleReconnect(id);
      throw e;
    } finally {
      this.persist();
    }
    return existing;
  }

  private async connect(id: string) {
    const rt = this.rt.get(id);
    const dev = this.devices.find((d) => d.id === id);
    if (!rt || !dev) return;
    const server = await rt.btDevice.gatt!.connect();
    rt.server = server;
    const service = await server.getPrimaryService(SERVICE_UUID);

    // Force a fresh CCCD write on (re)subscribe. After a device reboot the
    // firmware rebuilds its GATT DB with every CCCD at 0 and its notify flags
    // (gLsNotify, gRspNotify…) reset to false, so it only resumes notifications
    // once the central RE-WRITES the CCCD. A plain startNotifications() can be
    // skipped by the OS GATT cache if it still believes we're subscribed, which
    // leaves the link permanently silent. Toggling stop→start forces the
    // descriptor write through so the device re-arms notifications.
    const armNotify = async (ch: BluetoothRemoteGATTCharacteristic) => {
      try { await ch.stopNotifications(); } catch { /* not yet subscribed */ }
      await ch.startNotifications();
    };

    const [infoChar, statusChar, configChar, cmdChar, responseChar, logMetaChar, logDataChar] = await Promise.all([
      service.getCharacteristic(CHAR.DEVICE_INFO),
      service.getCharacteristic(CHAR.LIVE_STATUS),
      service.getCharacteristic(CHAR.CONFIG),
      service.getCharacteristic(CHAR.COMMAND),
      service.getCharacteristic(CHAR.RESPONSE),
      service.getCharacteristic(CHAR.LOG_META),
      service.getCharacteristic(CHAR.LOG_DATA),
    ]);
    let sonarChar: BluetoothRemoteGATTCharacteristic | undefined;
    try { sonarChar = await service.getCharacteristic(CHAR.SONAR_DBG); }
    catch { /* optional characteristic */ }
    rt.cmdChar = cmdChar;
    rt.statusChar = statusChar;
    rt.configChar = configChar;
    rt.logMetaChar = logMetaChar;

    // ── Per the BLE developer guide, the order matters: ───────────────────
    // Step 5 (MUST be first): Enable Response notifications before any
    // command is sent. The device only emits responses when this CCCD is on.
    responseChar.addEventListener("characteristicvaluechanged", (ev: Event) => {
      const v = (ev.target as BluetoothRemoteGATTCharacteristic).value;
      if (v) this.handleResponse(id, v);
    });
    await armNotify(responseChar);

    // Step 6: Enable LiveStatus notifications. v2.0 protocol — the payload
    // is a small comma-separated CSV that always fits in one BLE packet, so
    // we parse `event.target.value` directly (no readValue / ATT_READ_BLOB).
    statusChar.addEventListener("characteristicvaluechanged", (ev: Event) => {
      const v = (ev.target as BluetoothRemoteGATTCharacteristic).value;
      if (!v) return;
      const s = parseLiveStatusCsv(dvToText(v));
      if (s) {
        // A pushed notification (not the initial read) proves the CCCD is
        // armed and frames are flowing — clear the watchdog attempt budget.
        const r = this.rt.get(id);
        if (r) r.staleReconnects = 0;
        this.applyStatus(id, s);
        this.notify();
      }
    });
    await armNotify(statusChar);

    // LogData notifications (binary log-stream packets, ≤200 B each — safe
    // to read directly from the event value). v2.3 firmware:
    //   • requests 2M PHY on connect (doubles raw bit-rate when accepted)
    //   • bursts up to 16 chunks per main-loop tick into the HCI TX pool
    //   • requests a short connection interval (7.5–15 ms) at STARTLOGDL time
    //   • suspends LiveStatus notifications for the duration of the transfer
    // This handler can therefore be invoked very rapidly — keep the work
    // inside it minimal (header parse + buffer append) and defer expensive
    // parsing until the final chunk has arrived. We re-read 0x03 after
    // the transfer completes or is cancelled to refresh LiveStatus.
    logDataChar.addEventListener("characteristicvaluechanged", (ev: Event) => {
      const v = (ev.target as BluetoothRemoteGATTCharacteristic).value;
      if (v) this.handleLogData(id, v);
    });
    await armNotify(logDataChar);

    if (sonarChar) {
      sonarChar.addEventListener("characteristicvaluechanged", (ev: Event) => {
        const v = (ev.target as BluetoothRemoteGATTCharacteristic).value;
        if (!v) return;
        this.handleSonarDbg(id, v);
      });
      // Use armNotify (stop→start) like the other characteristics, NOT a plain
      // startNotifications(). After a device reboot the firmware rebuilds its
      // GATT DB with every CCCD at 0 and gSonarDbgNotify reset to false, so it
      // only re-arms sonar notifications once the central RE-WRITES the CCCD.
      // A plain startNotifications() can be skipped by the OS GATT cache (it
      // still thinks we're subscribed), leaving gSonarDbgNotify false — which
      // makes the firmware reject every SONARSHOT/SONARRAW with "enable
      // SonarDbg notifications first" and no readings ever reach the app.
      try { await armNotify(sonarChar); }
      catch (e) { console.warn("[njord] SonarDbg notifications failed", e); }
      // Keep a handle so sendCommand can re-arm the CCCD right before a shot
      // (the firmware's gSonarDbgNotify resets to false on every reboot).
      rt.sonarChar = sonarChar;
      rt.sonarArmed = true;
    }

    // Initial snapshot reads. These four characteristics are independent, so
    // issue them together and let the ATT queue pipeline them instead of
    // paying a full round-trip latency per read in series — this is the bulk
    // of the post-connect delay before a card shows live values.
    const [infoRes, statusRes, configRes, logMetaRes] = await Promise.allSettled([
      infoChar.readValue(),
      statusChar.readValue(),
      configChar.readValue(),
      logMetaChar.readValue(),
    ]);

    if (infoRes.status === "fulfilled") {
      try {
        const info = parseDeviceInfoCsv(dvToText(infoRes.value));
        if (info) {
          dev.info = info;
          if (info.unique_id && dev.name === "NjordAqua") {
            dev.name = `NJORD-${info.unique_id.toString(16).toUpperCase().slice(-6)}`;
          }
        }
      } catch (e) { console.warn("[njord] DeviceInfo parse failed", e); }
    } else { console.warn("[njord] DeviceInfo read failed", infoRes.reason); }

    if (statusRes.status === "fulfilled") {
      try {
        const s = parseLiveStatusCsv(dvToText(statusRes.value));
        if (s) this.applyStatus(id, s);
      } catch (e) { console.warn("[njord] LiveStatus parse failed", e); }
    } else { console.warn("[njord] LiveStatus read failed", statusRes.reason); }

    if (configRes.status === "fulfilled") {
      try {
        const c = parseConfigCsv(dvToText(configRes.value));
        if (c) this.configs[id] = c;
      } catch (e) { console.warn("[njord] Config parse failed", e); }
    } else { console.warn("[njord] Config read failed", configRes.reason); }

    if (logMetaRes.status === "fulfilled") {
      try {
        // v2.0 LogMeta CSV (char 0x07):
        //   `bytes_used, bytes_free, pct_used, chunk_payload_max`.
        const m = parseLogMetaCsv(dvToText(logMetaRes.value));
        if (m) this.logMeta[id] = m;
      } catch (e) { console.warn("[njord] LogMeta parse failed", e); }
    } else { console.warn("[njord] LogMeta read failed", logMetaRes.reason); }

    dev.online = true;
    dev.reconnecting = false;
    dev.lastUpdate = Date.now();
    dev.reconnects += 1;
    this.persist();
    this.notify();
  }

  private handleDisconnect(id: string) {
    const dev = this.devices.find((d) => d.id === id);
    const rt = this.rt.get(id);
    // Ignore stale disconnect events: if the current GATT server is connected,
    // this event belongs to a link we've already torn down and replaced (e.g.
    // during a watchdog-forced reconnect). Acting on it would wrongly mark the
    // freshly reconnected device offline.
    if (rt?.server?.connected) return;
    if (dev) dev.online = false;
    if (rt) {
      rt.pending.forEach((cb) => cb({ ok: false, error: "GATT disconnected" }));
      rt.pending.clear();
      rt.log = undefined;
      rt.sonarArmed = false;  // CCCD is gone with the link; re-arm on reconnect
    }
    this.abortInFlightLogProgress(id);
    this.notify();
    if (rt?.autoReconnect) this.scheduleReconnect(id);
  }

  /** Mark an in-flight log download as cancelled when the link drops out from
   *  under it (real disconnect, or a watchdog-forced reconnect for an
   *  unrelated reason) so it can't sit at "in progress" forever — that state
   *  is also what the watchdog checks (alongside rt.log) to decide whether
   *  LiveStatus silence is expected, so leaving a dead transfer marked
   *  in-flight would wrongly suppress zombie-link detection indefinitely. */
  private abortInFlightLogProgress(id: string) {
    const prev = this.logProgress[id];
    if (prev && prev.completedAt == null) {
      this.logProgress[id] = { ...prev, cancelled: true, completedAt: Date.now() };
    }
  }

  async reconnect(id: string) {
    const rt = this.rt.get(id);
    const dev = this.devices.find((d) => d.id === id);
    if (rt) {
      if (rt.reconnectTimer) { clearTimeout(rt.reconnectTimer); rt.reconnectTimer = undefined; }
      rt.reconnectAttempts = 0;
      rt.staleReconnects = 0;
      rt.autoReconnect = true;
    }
    if (dev) { dev.reconnecting = true; this.notify(); }
    try { await this.connect(id); } catch (e) {
      console.error("[njord] reconnect failed", e);
      if (rt?.autoReconnect) this.scheduleReconnect(id);
      throw e;
    }
  }

  /** Schedule an exponential-backoff reconnect attempt for a known device.
   *  Reconnecting to an already-paired BluetoothDevice does not require a
   *  user gesture, so we can transparently re-link whenever the device
   *  becomes available again. */
  private scheduleReconnect(id: string) {
    const rt = this.rt.get(id);
    if (!rt || !rt.autoReconnect) return;
    if (rt.reconnectTimer || rt.reconnecting) return;
    if (rt.server?.connected) return;
    const n = rt.reconnectAttempts;
    // 2s, 4s, 8s, 16s, 30s, 30s…
    const delay = Math.min(30_000, 2_000 * Math.pow(2, Math.min(n, 4)));
    rt.reconnectTimer = setTimeout(() => {
      const r = this.rt.get(id);
      if (!r) return;
      r.reconnectTimer = undefined;
      if (!r.autoReconnect || r.server?.connected) return;
      r.reconnecting = true;
      r.reconnectAttempts += 1;
      const dev = this.devices.find((d) => d.id === id);
      if (dev && !dev.reconnecting) { dev.reconnecting = true; this.notify(); }
      this.connect(id)
        .then(() => {
          const r2 = this.rt.get(id);
          if (r2) { r2.reconnectAttempts = 0; r2.reconnecting = false; }
        })
        .catch((e) => {
          console.debug("[njord] auto-reconnect attempt failed", e);
          const r2 = this.rt.get(id);
          if (r2) {
            r2.reconnecting = false;
            if (r2.autoReconnect) this.scheduleReconnect(id);
          }
        });
    }, delay);
  }

  /** No LiveStatus for this long on an "online" device ⇒ the link is dead
   *  (e.g. a silent post-reboot GATT zombie). LiveStatus is 1 Hz, so 8 s is
   *  8 missed frames — comfortably past any transient hiccup. */
  private static readonly WATCHDOG_STALE_MS = 8000;

  /** Max consecutive watchdog-forced reconnects without a LiveStatus frame
   *  before we stop physically cycling the link (avoids hammering the device
   *  forever if it truly cannot deliver notifications). Reset on any frame. */
  private static readonly WATCHDOG_MAX_ATTEMPTS = 5;

  /** Force a teardown+reconnect for any online device whose LiveStatus has
   *  gone silent. Skips devices with an in-flight log download (firmware
   *  suppresses LiveStatus during transfers) and any reconnect already in
   *  progress. */
  private runWatchdog() {
    const now = Date.now();
    for (const dev of this.devices) {
      if (!dev.online) continue;
      const rt = this.rt.get(dev.id);
      if (!rt || !rt.autoReconnect || rt.reconnecting || rt.reconnectTimer) continue;
      if (rt.log) continue; // log download legitimately silences LiveStatus
      // rt.log is only populated once the *first* LogData chunk actually
      // arrives (handleLogData). Firmware suppresses LiveStatus the instant
      // it ACKs STARTLOGDL — before that first chunk shows up — so there was
      // a window right after starting a download where LiveStatus was
      // already silent but rt.log was still unset, and the watchdog would
      // force-reconnect and abort the transfer it should have been ignoring.
      // logProgress is set synchronously from the STARTLOGDL ack (see
      // handleResponse's "start_log_download" case), so checking it too
      // closes that gap for the whole download, not just after the first chunk.
      const progress = this.logProgress[dev.id];
      if (progress && progress.completedAt == null) continue;
      if (now - dev.lastUpdate < Store.WATCHDOG_STALE_MS) continue;
      if (rt.staleReconnects >= Store.WATCHDOG_MAX_ATTEMPTS) continue; // gave up
      void this.forceReconnect(
        dev.id,
        `no LiveStatus for ${Math.round((now - dev.lastUpdate) / 1000)}s`,
      );
    }
  }

  /** Atomically tear the (possibly zombie) link down and re-establish it,
   *  re-arming notifications. Unlike scheduleReconnect this runs immediately
   *  and holds `reconnecting` across the whole disconnect→connect sequence so
   *  the in-flight `gattserverdisconnected` event can't spawn a competing
   *  reconnect (which produced the connect/disconnect storm). */
  private async forceReconnect(id: string, reason: string) {
    const rt = this.rt.get(id);
    const dev = this.devices.find((d) => d.id === id);
    if (!rt || !dev || rt.reconnecting) return;
    rt.reconnecting = true;
    rt.staleReconnects += 1;
    dev.reconnecting = true;
    if (rt.reconnectTimer) { clearTimeout(rt.reconnectTimer); rt.reconnectTimer = undefined; }
    rt.pending.forEach((cb) => cb({ ok: false, error: "link reset" }));
    rt.pending.clear();
    rt.log = undefined;
    this.abortInFlightLogProgress(id);
    this.notify();
    console.warn(`[njord] watchdog: ${reason} on ${id} — forcing reconnect (attempt ${rt.staleReconnects})`);
    try {
      try { if (rt.server?.connected) rt.server.disconnect(); } catch { /* ignore */ }
      // Let the controller settle the disconnect before re-linking so the OS
      // does a real reconnect (and re-writes the CCCDs) rather than handing
      // back the same zombie session.
      await new Promise((r) => setTimeout(r, 400));
      await this.connect(id);
      rt.reconnectAttempts = 0;
    } catch (e) {
      console.debug("[njord] watchdog reconnect failed", e);
      if (rt.autoReconnect) this.scheduleReconnect(id);
    } finally {
      rt.reconnecting = false;
      dev.reconnecting = false;
      this.notify();
    }
  }

  setAutoReconnect(id: string, enabled: boolean) {
    const rt = this.rt.get(id);
    if (!rt) return;
    rt.autoReconnect = enabled;
    if (!enabled && rt.reconnectTimer) {
      clearTimeout(rt.reconnectTimer);
      rt.reconnectTimer = undefined;
    }
    if (enabled && !rt.server?.connected) this.scheduleReconnect(id);
    this.notify();
  }


  disconnect(id: string) {
    const rt = this.rt.get(id);
    if (!rt) return;
    // Manual disconnect = don't auto-reconnect until the user asks.
    rt.autoReconnect = false;
    if (rt.reconnectTimer) { clearTimeout(rt.reconnectTimer); rt.reconnectTimer = undefined; }
    if (rt.server?.connected) rt.server.disconnect();
  }

  forget(id: string) {
    const rt = this.rt.get(id);
    if (rt) {
      rt.autoReconnect = false;
      if (rt.reconnectTimer) { clearTimeout(rt.reconnectTimer); rt.reconnectTimer = undefined; }
      if (rt.server?.connected) rt.server.disconnect();
    }
    // Best-effort: revoke the Web Bluetooth permission so the device no
    // longer appears in `navigator.bluetooth.getDevices()` on next load.
    const btDevice = rt?.btDevice as (BluetoothDevice & { forget?: () => Promise<void> }) | undefined;
    if (btDevice && typeof btDevice.forget === "function") {
      btDevice.forget().catch(() => {});
    }
    this.rt.delete(id);
    this.devices = this.devices.filter((d) => d.id !== id);
    delete this.telemetry[id];
    delete this.logs[id];
    delete this.logMeta[id];
    delete this.configs[id];
    delete this.sonar[id];
    delete this.sonarHistory[id];
    delete this.sonarRaw[id];
    delete this.sonarAccum[id];
    delete this.batchStats[id];
    this.commands = this.commands.filter((c) => c.deviceId !== id);
    this.persist();
    this.notify();
  }

  // ---- Notification handlers ---------------------------------------------
  private applyStatus(id: string, s: LiveStatus) {
    const dev = this.devices.find((d) => d.id === id);
    if (!dev) return;
    dev.status = s;
    const now = Date.now();
    dev.lastUpdate = now;
    dev.uptimeSec += 2;
    dev.rx_count += 1;
    dev.alarms = alarmsFromStatus(id, s, now);
    const tel = this.telemetry[id];
    tel.push({
      t: now,
      elec_ma: s.elec_ma, batt_mv: s.batt_mv, solar_mv: s.solar_mv,
      supply_mv: s.supply_mv, temp_c: s.temp_c, cruise_duty_pm: s.cruise_duty_pm,
      deliv_uc: s.deliv_uc,
    });
    if (tel.length > 240) tel.shift();
  }

  private handleResponse(id: string, dv: DataView) {
    const r = parseResponse(dvToText(dv));
    if (!r) return;
    const rt = this.rt.get(id);
    const cb = rt?.pending.get(r.id);
    if (cb) {
      rt!.pending.delete(r.id);
      cb({ ok: r.ok, data: r.data, error: r.error });
    }
  }

  // SonarDbg notifications carry either:
  //   - A UTF-8 CSV from SONARSHOT:
  //       "dist_mm,baseline,peak_delta,peak_idx,sample_count"
  //   - A binary chunk from SONARRAW (BLE Developer Guide v2.0 §11):
  //       [seq u16le][total_chunks u16le][...up to 38 uint16le ADC samples]
  //     The SONARRAW response itself carries metadata + exact sample count
  //     and is consumed by handleResponse, which pre-arms `sonarAccum[id]`
  //     before chunks arrive.
  // Text CSV always starts with an ASCII digit (0x30-0x39); binary chunks
  // start with a u16le seq value, which is < total and typically small,
  // but its low byte can also fall in the digit range — so we discriminate
  // by whether an accumulator was armed first.
  private handleSonarDbg(id: string, dv: DataView) {
    if (dv.byteLength < 2) return;
    const accum = this.sonarAccum[id];
    const b0 = dv.getUint8(0);
    const isText = !accum && b0 >= 0x30 && b0 <= 0x39;
    if (isText) {
      const f = dvToText(dv).split(",").map((x) => parseInt(x, 10));
      if (f.length >= 5 && !f.some(Number.isNaN)) {
        const sample: SonarSample = {
          t: Date.now(),
          dist_mm: f[0], baseline: f[1], peak_delta: f[2],
          peak_idx: f[3], sample_count: f[4],
        };
        this.sonar[id] = sample;
        const hist = this.sonarHistory[id] ?? (this.sonarHistory[id] = []);
        hist.push(sample);
        if (hist.length > 240) hist.shift();
        this.notify();
      }
      return;
    }
    // Binary chunk (SONARRAW). Requires the accumulator armed by the
    // SONARRAW response. Drop unsolicited chunks.
    if (!accum) return;
    if (dv.byteLength < 4) return;
    const seq = dv.getUint16(0, true);
    const total = dv.getUint16(2, true);
    if (total !== accum.total) return; // stale or mismatched stream
    const samplesInChunk = (dv.byteLength - 4) >> 1;
    if (samplesInChunk <= 0) return;
    const offset = seq * 38; // wire spec: up to 38 samples per chunk
    for (let i = 0; i < samplesInChunk; i++) {
      const idx = offset + i;
      if (idx >= accum.count) break;
      accum.samples[idx] = dv.getUint16(4 + i * 2, true);
    }
    accum.received += 1;
    if (seq === total - 1 || accum.received >= total) {
      const meta: SonarSample = {
        t: Date.now(),
        dist_mm: accum.meta.dist_mm,
        baseline: accum.meta.baseline,
        peak_delta: accum.meta.peak_delta,
        peak_idx: accum.meta.peak_idx,
        sample_count: accum.count,
      };
      this.sonar[id] = meta;
      this.sonarRaw[id] = {
        t: Date.now(),
        meta,
        samples: Array.from(accum.samples),
      };
      delete this.sonarAccum[id];
      this.notify();
    }
  }

  private handleLogData(id: string, dv: DataView) {
    if (dv.byteLength < 16) {
      console.warn(`[njord] LogData packet too short: ${dv.byteLength}B (header is 16B) — likely MTU<200, raise ATT MTU`);
      return;
    }
    const transferId = dv.getUint32(0, true);
    const seq = dv.getUint32(4, true);
    const total = dv.getUint32(8, true);
    const payloadLen = dv.getUint16(12, true);
    const expectedCrc = dv.getUint16(14, true);
    const payload = new Uint8Array(
      dv.buffer, dv.byteOffset + 16,
      Math.min(payloadLen, dv.byteLength - 16),
    );
    const truncated = payloadLen > dv.byteLength - 16;
    const crcOk = crc16(payload) === expectedCrc;
    if (!crcOk || truncated) {
      console.warn(
        `[njord] LogData bad seq=${seq}/${total} payloadLen=${payloadLen} got=${dv.byteLength - 16}B crcOk=${crcOk} truncated=${truncated}`,
      );
    } else {
      console.debug(
        `[njord] LogData rx seq=${seq}/${total} payload=${payloadLen}B mtu=${dv.byteLength}B`,
      );
    }
    const rt = this.rt.get(id);
    if (!rt) return;
    // Ignore late/duplicate chunks for a transfer that already completed. The
    // firmware bursts and retransmits chunks, so a stray retransmit can arrive
    // after we've already assembled every chunk and cleared rt.log. Without
    // this guard it would recreate the buffer (received=1) and reset the
    // progress bar back to the start, leaving it stuck at "1 chunk".
    if (!rt.log && rt.lastCompletedLogTransferId === transferId) {
      console.debug(`[njord] LogData late chunk for completed transfer ${transferId} seq=${seq} — ignored`);
      return;
    }
    if (!rt.log || rt.log.transferId !== transferId) {
      if (rt.log && rt.log.transferId !== transferId) {
        console.warn(`[njord] LogData transferId changed ${rt.log.transferId} → ${transferId} — resetting buffer`);
      }
      rt.log = { transferId, total, received: new Map() };
    }
    if (rt.log.received.has(seq)) {
      console.debug(`[njord] LogData duplicate seq=${seq} (retransmit)`);
    }
    rt.log.received.set(seq, new Uint8Array(payload));
    this.logProgress[id] = {
      total: rt.log.total,
      received: rt.log.received.size,
      startedAt: this.logProgress[id]?.startedAt ?? Date.now(),
    };
    if (rt.log.received.size === rt.log.total) {
      // Concatenate every chunk payload in seq order, then decode the resulting
      // UTF-8 blob as newline-separated `TEL,…`/`STT,…`/`SON,…` records.
      // Heavy decode + parse work is deferred to a microtask so the GATT
      // event handler returns immediately; this prevents Chrome from
      // back-pressuring the radio if another transfer is queued right after.
      let totalBytes = 0;
      for (let i = 0; i < rt.log.total; i++) {
        const p = rt.log.received.get(i);
        if (p) totalBytes += p.byteLength;
      }
      const combined = new Uint8Array(totalBytes);
      let pos = 0;
      for (let i = 0; i < rt.log.total; i++) {
        const p = rt.log.received.get(i);
        if (p) { combined.set(p, pos); pos += p.byteLength; }
      }
      const text = td ? td.decode(combined) : "";
      rt.log = undefined;
      rt.lastCompletedLogTransferId = transferId;
      const prev = this.logProgress[id];
      if (prev) this.logProgress[id] = { ...prev, completedAt: Date.now() };
      this.notify();
      // Defer parse off the GATT event tick (firmware now bursts chunks
      // 1–6 per connection event, so we yield before the heavy work).
      setTimeout(() => {
        const parsed = parseLogText(text);
        this.logs[id] = parsed.entries;
        if (parsed.batch) this.batchStats[id] = parsed.batch;
        this.notify();
        // Archive a CSV snapshot so the user can rename / re-download it
        // later from the Saved logs panel. Only archive non-empty captures
        // (a zero-entry parse usually means the device flash was empty,
        // which is not worth saving). Imports are deferred to break the
        // circular dependency between store.ts ↔ savedLogs.ts ↔ logCsv.ts.
        if (parsed.entries.length > 0) {
          // Include the user-defined device name suffix (API v2.12 SETNAME) in
          // the archived log's default name so it is easy to tell apart.
          const devName = this.devices.find((d) => d.id === id)?.name;
          const nameSuffix = devName?.startsWith("Njord-")
            ? devName.slice("Njord-".length)
            : "";
          Promise.all([
            import("@/lib/savedLogs"),
            import("@/lib/logCsv"),
          ]).then(([sl, lc]) => {
            try {
              sl.archiveSavedLog({
                deviceId: id,
                csv: lc.buildLogCsv(parsed.entries),
                entryCount: parsed.entries.length,
                nameSuffix,
              });
            } catch (err) {
              console.warn("savedLogs: archive failed", err);
            }
          });
        }
      }, 0);
      // Re-read LogMeta so bytes_used / pct_used reflect what's still in
      // flash, and re-read LiveStatus because the firmware suspends 0x03
      // notifications for the duration of STARTLOGDL.
      this.refreshLogMeta(id).catch(() => {});
      this.refreshStatus(id).catch(() => {});
    }
  }

  // ---- Command / Response API --------------------------------------------
  /** Force a fresh CCCD write (stop→start) on the SonarDbg characteristic so
   *  the firmware re-sets gSonarDbgNotify=true. A device reboot (e.g. after a
   *  reflash) clears that flag, and the OS GATT cache can skip a plain
   *  re-subscribe because it still believes we're subscribed — which makes the
   *  firmware silently reject SONARSHOT/SONARRAW. Serialized via enqueueGatt so
   *  it completes before the command write that follows it. */
  private rearmSonarNotify(rt: DeviceRuntime): Promise<void> {
    const ch = rt.sonarChar;
    if (!ch) return Promise.resolve();
    return this.enqueueGatt(rt, async () => {
      try { await ch.stopNotifications(); } catch { /* not yet subscribed */ }
      await ch.startNotifications();
    });
  }

  sendCommand(deviceId: string, cmd: string, data?: unknown): CommandEntry {
    const reqId = this.reqIdSeq++;
    const entry: CommandEntry = {
      uid: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      reqId, deviceId, cmd, data, sentAt: Date.now(), status: "pending",
    };
    this.commands.unshift(entry);
    this.notify();

    const rt = this.rt.get(deviceId);
    const dev = this.devices.find((d) => d.id === deviceId);
    if (!rt?.cmdChar || !dev?.online || !te) {
      entry.status = "error";
      entry.error = "Device not connected";
      entry.responseAt = Date.now();
      this.notify();
      return entry;
    }

    const encoded = encodeCommand(reqId, cmd, data);
    if (typeof encoded !== "string") {
      entry.status = "error";
      entry.error = encoded.error;
      entry.responseAt = Date.now();
      this.notify();
      return entry;
    }
    const bytes = te.encode(encoded);
    dev.tx_count += 1;

    const timeout = setTimeout(() => {
      if (entry.status === "pending") {
        rt.pending.delete(reqId);
        entry.status = "error";
        entry.error = "Response timeout (5 s)";
        entry.responseAt = Date.now();
        this.notify();
      }
    }, 5000);

    rt.pending.set(reqId, (r) => {
      clearTimeout(timeout);
      entry.responseAt = Date.now();
      entry.status = r.ok ? "ok" : "error";
      entry.response = r.ok
        ? (r.data !== undefined ? { id: reqId, ok: true, data: r.data } : { id: reqId, ok: true })
        : { id: reqId, ok: false, error: r.error };
      if (!r.ok) entry.error = r.error ?? "device returned !ok";

      if (r.ok) {
        // v2.0: GETSTATUS / GETCFG / SETCFG only ACK; re-read the
        // characteristic to fetch the fresh CSV payload.
        if (cmd === "get_status") this.refreshStatus(deviceId).catch(() => {});
        if (cmd === "get_config") this.refreshConfig(deviceId).catch(() => {});
        if (cmd === "set_config") this.refreshConfig(deviceId).catch(() => {});
        // START/STOP (AppSM_StartElectrolysis/AppSM_StopElectrolysis) flip the
        // persisted `electrolysisEnabled` flag directly on the device — they
        // don't go through SETCFG — so without this our local `config.elec_en`
        // (and everything derived from it, e.g. dosingMode) would never learn
        // about the change until some unrelated GETCFG happened to run. That
        // let the Home screen's optimistic "pendingMode" mask the stale value
        // while mounted, but the real (never-updated) mode would reappear the
        // moment the screen remounted (e.g. after visiting Overview and back)
        // — looking exactly like "the mode switched itself back on".
        if (cmd === "start_treatment") this.refreshConfig(deviceId).catch(() => {});
        if (cmd === "stop_treatment") this.refreshConfig(deviceId).catch(() => {});
        if (cmd === "set_name") {
          // SETNAME only ACKs; re-read Config to pick up the new nm= suffix.
          // Also reflect the new advertised name locally for instant feedback
          // (the device won't re-advertise until the next disconnect).
          const d = (entry.data ?? {}) as { suffix?: string };
          const suffix = (d.suffix ?? "").trim();
          const dev = this.devices.find((x) => x.id === deviceId);
          if (dev) dev.name = suffix ? `Njord-${suffix}` : "NjordAqua";
          this.refreshConfig(deviceId).catch(() => {});
          this.notify();
        }
        if (cmd === "request_log_info" && r.data) {
          // Inline GETLOGINFO response: `bytes_used bytes_free pct_used`
          // (3 space-separated integers). Optimistic update; keep the
          // characteristic's chunk_payload_max for later refresh.
          const f = r.data.split(/\s+/).map((x) => parseInt(x, 10));
          if (f.length >= 3 && !f.slice(0, 3).some(Number.isNaN)) {
            const prev = this.logMeta[deviceId];
            this.logMeta[deviceId] = {
              bytes_used: f[0],
              bytes_free: f[1],
              pct_used:   f[2],
              chunk_payload_max: prev?.chunk_payload_max ?? 180,
            };
          }
          this.refreshLogMeta(deviceId).catch(() => {});
        }
        if (cmd === "delete_logs" || cmd === "factory_reset") {
          this.logs[deviceId] = [];
          this.logMeta[deviceId] = {
            bytes_used: 0, bytes_free: 0, pct_used: 0, chunk_payload_max: 180,
          };
          delete this.logProgress[deviceId];
          if (cmd === "factory_reset") {
            this.refreshConfig(deviceId).catch(() => {});
            delete this.batchStats[deviceId];
          }
          // DELLOGS erases the flash region (~1 s); re-read LogMeta so
          // bytes_free reflects the now-cleared region.
          this.refreshLogMeta(deviceId).catch(() => {});
        }
        if (cmd === "reset_batch") {
          delete this.batchStats[deviceId];
        }
        if (cmd === "start_log_download" && r.data) {
          // Response: `<id> OK total_chunks`
          const total = parseInt(r.data.trim().split(/\s+/)[0], 10);
          if (!Number.isNaN(total) && total > 0) {
            this.logProgress[deviceId] = {
              total,
              received: 0,
              startedAt: Date.now(),
            };
          }
        }
        if (cmd === "cancel_log_download") {
          const prev = this.logProgress[deviceId];
          if (prev && prev.completedAt == null) {
            this.logProgress[deviceId] = { ...prev, cancelled: true, completedAt: Date.now() };
          }
          const rt2 = this.rt.get(deviceId);
          if (rt2) rt2.log = undefined;
          // LiveStatus push was suspended for the duration of STARTLOGDL;
          // pull a fresh read so the UI doesn't sit on a stale snapshot.
          this.refreshStatus(deviceId).catch(() => {});
        }
        if (cmd === "sonar_raw" && r.data) {
          // Response: "dist_mm,baseline,peak_delta,peak_idx,count"
          // Arm the chunk accumulator with metadata + exact sample count
          // BEFORE the device starts streaming binary chunks on SonarDbg.
          const m = r.data.split(",").map((x) => parseInt(x, 10));
          if (m.length >= 5 && !m.some(Number.isNaN) && m[4] > 0) {
            const count = m[4];
            const total = Math.ceil(count / 38); // 38 samples per chunk
            this.sonarAccum[deviceId] = {
              total,
              count,
              received: 0,
              samples: new Uint16Array(count),
              meta: { dist_mm: m[0], baseline: m[1], peak_delta: m[2], peak_idx: m[3] },
            };
          }
        }
        if (cmd === "sonar_stats" && r.data) {
          // Response: "median_mm,mean_mm,stddev_mm,count"
          const m = r.data.split(",").map((x) => parseInt(x, 10));
          if (m.length >= 4 && !m.some(Number.isNaN)) {
            this.sonarStats[deviceId] = {
              t: Date.now(),
              median_mm: m[0], mean_mm: m[1], stddev_mm: m[2], count: m[3],
            };
            // Fold the median into the rolling history so the trend graph and
            // status panel reflect the (far more reliable) aggregate result.
            const sample: SonarSample = {
              t: Date.now(),
              dist_mm: m[0], baseline: 0, peak_delta: m[2], peak_idx: 0,
              sample_count: m[3],
            };
            this.sonar[deviceId] = sample;
            const hist = this.sonarHistory[deviceId] ?? (this.sonarHistory[deviceId] = []);
            hist.push(sample);
            if (hist.length > 240) hist.shift();
          }
        }
        if (cmd === "sonar_robust" && r.data) {
          // Response: "median_mm,stddev_mm,flag,groups,per_group"
          const m = r.data.split(",").map((x) => parseInt(x, 10));
          if (m.length >= 5 && !m.some(Number.isNaN)) {
            this.sonarRobust[deviceId] = {
              t: Date.now(),
              median_mm: m[0], stddev_mm: m[1], valid: m[2] !== 0,
              groups: m[3], per_group: m[4],
            };
            // Fold the headline median into the rolling history like SONARSTATS.
            const sample: SonarSample = {
              t: Date.now(),
              dist_mm: m[0], baseline: 0, peak_delta: 0, peak_idx: 0,
              sample_count: m[4],
            };
            this.sonar[deviceId] = sample;
            const hist = this.sonarHistory[deviceId] ?? (this.sonarHistory[deviceId] = []);
            hist.push(sample);
            if (hist.length > 240) hist.shift();
          }
        }
      }
      this.notify();
    });

    // SonarDbg notifications must be armed on the firmware (gSonarDbgNotify) or
    // it rejects SONARSHOT/SONARRAW with "enable SonarDbg notifications first".
    // They are armed once at connect; only re-arm here if that hasn't happened
    // on this connection (e.g. the connect-time arm failed). Re-arming on every
    // shot churned the CCCD subscription and made back-to-back readings drop —
    // and for sonar_raw it tore down an in-flight chunk stream mid-transfer.
    if ((cmd === "sonar_shot" || cmd === "sonar_raw") && !rt.sonarArmed) {
      this.rearmSonarNotify(rt)
        .then(() => { rt.sonarArmed = true; })
        .catch((e) => console.warn("[njord] sonar re-arm failed", e));
    }

    const writer = rt.cmdChar.writeValueWithoutResponse
      ? rt.cmdChar.writeValueWithoutResponse.bind(rt.cmdChar)
      : rt.cmdChar.writeValue.bind(rt.cmdChar);
    this.enqueueGatt(rt, () => writer(bytes)).catch((err: unknown) => {
      clearTimeout(timeout);
      rt.pending.delete(reqId);
      entry.status = "error";
      entry.error = err instanceof Error ? err.message : String(err);
      entry.responseAt = Date.now();
      this.notify();
    });

    return entry;
  }

  private async refreshConfig(deviceId: string) {
    const rt = this.rt.get(deviceId);
    if (!rt?.server?.connected) return;
    await this.enqueueGatt(rt, async () => {
      try {
        const ch = rt.configChar ?? await (await rt.server!.getPrimaryService(SERVICE_UUID)).getCharacteristic(CHAR.CONFIG);
        const c = parseConfigCsv(dvToText(await ch.readValue()));
        if (c) { this.configs[deviceId] = c; this.notify(); }
      } catch (e) { console.warn("[njord] refreshConfig failed", e); }
    });
  }

  private async refreshStatus(deviceId: string) {
    const rt = this.rt.get(deviceId);
    if (!rt?.server?.connected) return;
    await this.enqueueGatt(rt, async () => {
      try {
        const ch = rt.statusChar ?? await (await rt.server!.getPrimaryService(SERVICE_UUID)).getCharacteristic(CHAR.LIVE_STATUS);
        const s = parseLiveStatusCsv(dvToText(await ch.readValue()));
        if (s) { this.applyStatus(deviceId, s); this.notify(); }
      } catch (e) { console.warn("[njord] refreshStatus failed", e); }
    });
  }

  /** Re-read the LogMeta characteristic (0x07). v2.0 CSV is
   *  `count, oldest_ts, newest_ts, total_bytes, chunk_payload_max`. */
  private async refreshLogMeta(deviceId: string) {
    const rt = this.rt.get(deviceId);
    if (!rt?.server?.connected) return;
    await this.enqueueGatt(rt, async () => {
      try {
        const ch = rt.logMetaChar ?? await (await rt.server!.getPrimaryService(SERVICE_UUID)).getCharacteristic(CHAR.LOG_META);
        const m = parseLogMetaCsv(dvToText(await ch.readValue()));
        if (m) {
          this.logMeta[deviceId] = m;
          this.notify();
        }
      } catch (e) { console.warn("[njord] refreshLogMeta failed", e); }
    });
  }

  /** Serialize GATT operations per device. Web Bluetooth only allows one
   *  in-flight read/write/subscribe per connection — concurrent ops throw
   *  "GATT operation already in progress". */
  private enqueueGatt<T>(rt: DeviceRuntime, fn: () => Promise<T>): Promise<T> {
    const next = rt.gattQueue.then(fn, fn) as Promise<T>;
    rt.gattQueue = next.catch(() => undefined);
    return next;
  }

  updateConfig(id: string, patch: Partial<NjordConfig>): string | null {
    const err = validateConfig(patch);
    if (err) return err;
    this.sendCommand(id, "set_config", patch);
    return null;
  }
}

export const store = new Store();

// =============================================================================
// React bindings
// =============================================================================
function useStore<T>(selector: (s: Store) => T): T {
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsub = store.subscribe(() => setTick((n) => n + 1));
    return () => { unsub(); };
  }, []);
  return selector(store);
}

export function useDevices() { return useStore((s) => s.devices); }
export function useDevice(id: string | undefined) {
  return useStore((s) => s.devices.find((d) => d.id === id));
}
export function useTelemetry(id: string | undefined) {
  return useStore((s) => (id ? s.telemetry[id] ?? [] : []));
}
export function useSonarHistory(id: string | undefined) {
  return useStore((s) => (id ? s.sonarHistory[id] ?? [] : []));
}
export function useSonar(id: string | undefined) {
  return useStore((s) => (id ? s.sonar[id] : undefined));
}
export function useSonarRaw(id: string | undefined) {
  return useStore((s) => (id ? s.sonarRaw[id] : undefined));
}
export function useSonarStats(id: string | undefined) {
  return useStore((s) => (id ? s.sonarStats[id] : undefined));
}
export function useSonarRobust(id: string | undefined) {
  return useStore((s) => (id ? s.sonarRobust[id] : undefined));
}
export function useLogs(id: string | undefined) {
  return useStore((s) => (id ? s.logs[id] ?? [] : []));
}
export function useLogMeta(id: string | undefined) {
  return useStore((s) => (id ? s.logMeta[id] : undefined));
}
export function useBatchStats(id: string | undefined) {
  return useStore((s) => (id ? s.batchStats[id] : undefined));
}
export function useLogProgress(id: string | undefined) {
  return useStore((s) => (id ? s.logProgress[id] : undefined));
}
export function useConfig(id: string | undefined) {
  return useStore((s) => (id ? s.configs[id] : undefined));
}
export function useCommands(deviceId?: string) {
  return useStore((s) => deviceId ? s.commands.filter((c) => c.deviceId === deviceId) : s.commands);
}
export function useAllAlarms() {
  return useStore((s) => s.devices.flatMap((d) => d.alarms));
}
export function useBleSupported() { return useStore((s) => s.isSupported()); }
export function usePairing() { return useStore((s) => s.pairing); }

export function sendCommand(deviceId: string, cmd: string, data?: unknown) {
  return store.sendCommand(deviceId, cmd, data);
}
export function updateConfig(id: string, patch: Partial<NjordConfig>) {
  return store.updateConfig(id, patch);
}

/** Resolve once a command entry leaves "pending" (ok or error). Lets callers
 *  chain dependent commands — e.g. STOP must actually be acked (and the
 *  firmware's EnterIdle() transition given a moment to happen) before SETCFG
 *  and START are sent — instead of firing writes back-to-back over BLE and
 *  hoping the timing works out. Firing 3 writes with no gap between them was
 *  intermittently racing/getting dropped, which showed up as needing to tap
 *  the chlorination mode toggle twice before it actually took effect. */
export function waitForCommand(entry: CommandEntry): Promise<CommandEntry> {
  if (entry.status !== "pending") return Promise.resolve(entry);
  return new Promise((resolve) => {
    const unsub = store.subscribe(() => {
      if (entry.status !== "pending") {
        unsub();
        resolve(entry);
      }
    });
  });
}
export function pairDevice() { return store.pair(); }
export function recoverPairingAfterResume() { store.recoverPairingAfterResume(); }
export function reconnectDevice(id: string) { return store.reconnect(id); }
export function disconnectDevice(id: string) { return store.disconnect(id); }
export function forgetDevice(id: string) { return store.forget(id); }
export function setAutoReconnect(id: string, enabled: boolean) {
  return store.setAutoReconnect(id, enabled);
}