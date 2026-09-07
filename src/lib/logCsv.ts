// Shared "log entries → CSV" formatter. Used by:
//   • src/routes/devices.$deviceId.tsx — the user-visible Export CSV button.
//   • src/lib/device/store.ts — auto-archives every completed download via
//     savedLogs.archiveSavedLog().
//
// Keeping the producer in one place ensures the file the user downloads
// immediately and the archived re-download are byte-identical.

import type { LogEntry } from "@/lib/device/types";
import { NJORD_EPOCH_OFFSET } from "@/lib/device/types";

function formatNjordTs(t: number): string {
  if (!t) return "";
  return new Date((t + NJORD_EPOCH_OFFSET) * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19) + "Z";
}

function esc(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV string from decoded log entries. Only TEL (telemetry) rows are
 *  exported: the STT state-change and SON sonar rows carry no information that
 *  is not already embedded in the surrounding TEL samples (state/fault/cycle
 *  fields), so including them only bloats the file with sparse, mostly-empty
 *  columns. Headers are derived from the union of fields actually present in
 *  any TEL row, ordered by a stable preferred list (extras appended). */
export function buildLogCsv(entries: LogEntry[]): string {
  const rows = entries
    .filter((e): e is Extract<LogEntry, { type: "TEL" }> => e.type === "TEL")
    .map((e) => {
      const r: Record<string, string | number> = {
        ts_iso: formatNjordTs(e.ts),
        ts_raw: e.ts,
        type: e.type,
      };
      r.battery_mv = e.battery_mv;
      r.solar_mv = e.solar_mv;
      r.supply_mv = e.supply_mv;
      r.temp_c = e.temp_c;
      // Charge is stored internally as µC; export in Coulombs for readability.
      r.delivered_c = e.delivered_uc / 1_000_000;
      r.target_c = e.target_uc / 1_000_000;
      r.target_ma = e.target_ma;
      r.polarity = e.polarity;
      r.cycle_avg_ma = e.cycle_avg_ma;
      r.cruise_duty_pm = e.cruise_duty_pm;
      r.elec_mv = e.elec_mv;
      r.cycle_dur_s = e.cycle_dur_s;
      r.cycle_count = e.cycle_count;
      r.reboot_count = e.reboot_count;
      // Charge debt (already Coulombs).
      r.charge_debt_c = e.charge_debt_c;
      r.debt_removed_c = e.debt_removed_c;
      // Batch running-average snapshot (v2.9 — self-contained TEL-only export).
      r.batch_avg_batt_mv = e.batch_avg_batt_mv;
      r.batch_avg_supply_mv = e.batch_avg_supply_mv;
      r.batch_avg_solar_mv = e.batch_avg_solar_mv;
      r.batch_avg_elec_ma = e.batch_avg_elec_ma;
      r.batch_avg_temp_c = e.batch_avg_temp_c;
      r.batch_accum_c = e.batch_accum_c;
      r.batch_cycles = e.batch_cycles;
      return r;
    });

  const present = new Set<string>();
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      if (v != null && v !== "") present.add(k);
    }
  }

  const preferredOrder = [
    "ts_iso", "ts_raw", "type",
    "battery_mv", "solar_mv", "supply_mv",
    "temp_c", "delivered_c", "target_c",
    "target_ma", "polarity",
    "cycle_avg_ma", "cruise_duty_pm", "elec_mv",
    "cycle_dur_s", "cycle_count", "reboot_count",
    "charge_debt_c", "debt_removed_c",
    "batch_avg_batt_mv", "batch_avg_supply_mv", "batch_avg_solar_mv",
    "batch_avg_elec_ma", "batch_avg_temp_c", "batch_accum_c", "batch_cycles",
  ];
  const headers = preferredOrder.filter((h) => present.has(h));
  for (const h of present) {
    if (!headers.includes(h)) headers.push(h);
  }

  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ].join("\n");
}
