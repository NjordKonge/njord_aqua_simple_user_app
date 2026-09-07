# Firmware follow-ups — njord-aqua-simple

Notes for the firmware developer, collected while building the simplified
end-user app on top of the existing (locked) BLE protocol. Nothing in the
firmware was changed to produce this app — everything below is either an
interim client-side approximation or a documented assumption that should be
confirmed/implemented on the firmware side later.

## 1. Salt level (conductivity)

The design spec calls for a "salt level too low" style reading/alert. This
device has no salt reservoir (it's an electrode electrolysis chlorinator),
but per direction from the product owner this will be based on **water
conductivity**, measured by a sensor not yet exposed over BLE.

Needed later:
- A new `LiveStatus` field for the live conductivity reading, e.g.
  `cond_us_cm` (µS/cm).
- A low-conductivity threshold, most likely a new config field (e.g.
  `cond_min_us_cm`), validated the same way other `NjordConfig` fields are
  in `validateConfig`.
- A fault/alarm code (e.g. `COND_LOW`) raised through the existing
  `fault` / alarm pipeline (`Device.alarms`, `AlarmSeverity`), so the app
  doesn't need any new plumbing — it already surfaces any fault code that
  exists.

App-side today: `src/lib/device/alerts.ts` (`ALERT_REFERENCE`) lists only
the fault codes that exist today. No "salt level" entry is shown yet — add
one once the fault code above exists.

## 2. Tank volume (sonar + tank version)

Interim behaviour today (`src/lib/device/tank.ts`): the app computes litres
itself, client-side, from existing config fields:

```
litres = (tank_max_mm - dist_mm) * fill_l_mm   // clamped to [0, tank_l]
```

`dist_mm` comes from an on-demand `sonar_shot` command — the sensor is not
polled continuously, so the app re-requests a reading periodically while the
Home screen is open.

Per direction from the product owner, the intended long-term design instead
computes the fill volume from the sonar distance **and the tank's
version/model** (tank geometry — domed top, straight sides, etc. — differs
by brand/model, so a single linear mm→litre factor is only an approximation).
This implies:

- A "tank version" (or model id) needs to become a **real device config
  field**, sent over BLE. Today it only exists as a phone-local, never-synced
  setting (`TankModel` in `src/lib/settings/tankSettings.ts`:
  `sintex` / `vectus` / `pallet_tank` / `ashirvad`), purely for display —
  it is never sent to the device.
- The firmware should own the sonar→litres conversion (using the tank
  version + sonar distance) and report an already-computed value in
  `LiveStatus`, e.g. `tank_fill_l` or `tank_fill_pct`, rather than the app
  reproducing the geometry math. This avoids the app and firmware ever
  disagreeing on the calculation.

Until this lands, the app keeps using the linear approximation above, and
the tank model selector stays phone-local only.

## 3. Other assumptions/gaps carried over from the design-spec build

These aren't blocked on new sensors, just worth firmware/PM sign-off:

- **`water_src` mapping** (`src/lib/device/waterSource.ts`): the app maps
  the 1–5 config code to labels as `1=borehole, 2=rainwater,
  3=municipal_surface, 4=municipal_borehole`. This ordinal→label assignment
  was not documented anywhere and is an app-side guess.
- **`chloride_mg_l` dual use**: this single existing field is used both as
  (a) the dosing-mode target (`src/lib/device/dosing.ts`) and (b) the
  "pre-chlorination of incoming water" input (`src/lib/device/prechlorination.ts`).
  Confirm this overload is intended, or whether these should be two separate
  fields.
- **No "safe to use" / ETA signal**: there's no firmware concept of "water is
  safe to use" or a "safe again at" time. `src/lib/device/waterStatus.ts`
  proxies a "not yet safe" state off `debt_removal_active` and never shows an
  ETA. If a real signal/ETA becomes available, this file is the only place
  that needs updating.
- **No flow sensor**: daily/weekly/monthly water-consumption figures and
  "last water delivery" have no data source at all today. The Overview
  screen shows explicit "Not available" states rather than fabricated
  numbers.
- **Watts are derived, not native**: `src/lib/device/power.ts` computes
  `(elec_mv/1000) * (elec_ma/1000)` for the live value, and reconstructs
  `elec_mv` from `cruise_duty_pm * supply_mv` for historical telemetry
  (which doesn't carry `elec_mv` directly). If firmware ever exposes watts
  directly, this file can be simplified.

## 4. Suggested new fields (summary)

| Concept | Suggested field | Type | Where |
|---|---|---|---|
| Conductivity reading | `cond_us_cm` | uint16/float | `LiveStatus` |
| Conductivity low threshold | `cond_min_us_cm` | uint16 | `NjordConfig` (SETCFG) |
| Salt/conductivity low fault | `COND_LOW` | fault enum entry | reuses existing fault/alarm pipeline |
| Tank model/version | `tank_version` | uint8/enum | `NjordConfig` (SETCFG) — replaces phone-local-only `tankModel` |
| Computed tank fill | `tank_fill_l` or `tank_fill_pct` | float/uint8 | `LiveStatus` — computed from sonar + `tank_version` |

## 5. App files to revisit once the above land

- `src/lib/device/types.ts` — add the new fields to `LiveStatus` / `NjordConfig`.
- `src/lib/device/tank.ts` — swap the linear calc for the firmware-provided value.
- `src/lib/device/alerts.ts` — add a `COND_LOW` entry to `ALERT_REFERENCE`.
- `src/lib/settings/tankSettings.ts` — once `tank_version` is a real config
  field, rewire this from `localStorage` to `updateConfig`/`useConfig`
  (mirroring the pattern already used in `waterSource.ts`), keeping the same
  picker UI in Settings.
