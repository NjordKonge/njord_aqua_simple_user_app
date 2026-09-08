import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useDevices, useConfig, updateConfig } from "@/lib/device/store";
import { pairDevice, forgetDevice, reconnectDevice } from "@/lib/device/actions";
import {
  waterSourceFromConfig,
  setWaterSource,
  WATER_SOURCE_LABEL,
  type WaterSource,
} from "@/lib/device/waterSource";
import {
  prechlorinationFromConfig,
  setPrechlorination,
  PRECHLORINATION_MIN_MG_L,
  PRECHLORINATION_MAX_MG_L,
  PRECHLORINATION_STEP_MG_L,
} from "@/lib/device/prechlorination";
import { useTankModel, setTankModel, TANK_MODEL_LABEL, type TankModel } from "@/lib/settings/tankSettings";
import { useChlorinationLevels, setChlorinationLevels } from "@/lib/settings/chlorinationSettings";
import {
  theoreticalMaxChargeC,
  TARGET_CURRENT_MIN_MA,
  TARGET_CURRENT_MAX_MA,
} from "@/lib/device/dosing";
import { ALERT_REFERENCE } from "@/lib/device/alerts";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { ListRow } from "@/components/ui/ListRow";
import { PickerSheet } from "@/components/ui/PickerSheet";
import { InfoSheet } from "@/components/ui/InfoSheet";

export const Route = createFileRoute("/settings")({
  component: SettingsScreen,
});

const TANK_VOLUME_OPTIONS_L = [500, 1000, 1500, 2000, 3000, 5000];

function SettingsScreen() {
  const devices = useDevices();
  const device = devices[0];
  const config = useConfig(device?.id);

  const tankModel = useTankModel();
  const chlorinationLevels = useChlorinationLevels();
  const [tankModelOpen, setTankModelOpen] = useState(false);
  const [tankVolumeOpen, setTankVolumeOpen] = useState(false);
  const [waterSourceOpen, setWaterSourceOpen] = useState(false);
  const [alertInfoOpen, setAlertInfoOpen] = useState(false);

  const waterSource = waterSourceFromConfig(config);
  const prechlorination = prechlorinationFromConfig(config);

  return (
    <div className="space-y-6">
      <Header />
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* Bluetooth */}
      <section>
        {device?.online ? (
          <div className="space-y-2 rounded-card bg-surface p-4">
            <p className="text-sm text-muted">Bluetooth</p>
            <p className="text-good">Connected to {device.name}</p>
            <Button variant="secondary" onClick={() => void forgetDevice(device.id)}>
              Forget device
            </Button>
          </div>
        ) : device ? (
          <div className="space-y-2 rounded-card bg-surface p-4">
            <p className="text-sm text-muted">Bluetooth</p>
            <Button onClick={() => void reconnectDevice(device.id)}>Reconnect</Button>
          </div>
        ) : (
          <Button onClick={() => void pairDevice()}>Pair device</Button>
        )}
      </section>

      {/* Tank setup */}
      <section>
        <p className="mb-2 text-sm text-muted">Tank setup</p>
        <div className="overflow-hidden rounded-card">
          <ListRow
            label="Tank model"
            value={tankModel ? TANK_MODEL_LABEL[tankModel] : "Not set"}
            onClick={() => setTankModelOpen(true)}
          />
          <ListRow
            label="Tank volume"
            value={config ? `${config.tank_l}L` : "—"}
            onClick={() => setTankVolumeOpen(true)}
            disabled={!device?.online}
          />
        </div>
      </section>

      {/* Water source */}
      <section>
        <p className="mb-2 text-sm text-muted">Water source</p>
        <div className="overflow-hidden rounded-card">
          <ListRow
            label="Source type"
            value={waterSource ? WATER_SOURCE_LABEL[waterSource] : "Not set"}
            onClick={() => setWaterSourceOpen(true)}
            disabled={!device?.online}
          />
        </div>
      </section>

      {/* Pre-chlorination */}
      <section className="rounded-card bg-surface p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-sm text-muted">Pre-chlorination of incoming water</p>
          <p className="font-medium">{prechlorination.toFixed(1)} mg/L</p>
        </div>
        <input
          type="range"
          min={PRECHLORINATION_MIN_MG_L}
          max={PRECHLORINATION_MAX_MG_L}
          step={PRECHLORINATION_STEP_MG_L}
          value={prechlorination}
          disabled={!device?.online}
          onChange={(e) => device?.online && setPrechlorination(device.id, Number(e.target.value))}
          className="w-full accent-[var(--color-brand)] disabled:opacity-50"
        />
        {!device?.online ? (
          <p className="mt-2 text-xs text-muted">Connect to the device to change this setting.</p>
        ) : null}
      </section>

      {/* Electrode current */}
      <section className="space-y-3 rounded-card bg-surface p-4">
        <p className="text-sm text-muted">Electrode current</p>
        <p className="text-xs text-muted">
          The device drives the electrode with a PWM current controller (see AppStateMachine.cpp)
          that continuously adjusts the H-bridge duty cycle to track this target current — it is
          not a fixed duty, it actively measures and corrects toward this exact setpoint every
          100 ms. Capped here at 3A for safety headroom below the device's overcurrent fault.
        </p>
        <TargetCurrentField
          value={config?.target_ma}
          disabled={!device?.online}
          onCommit={(v) => device?.online && updateConfig(device.id, { target_ma: v })}
        />
      </section>

      {/* Chlorination charge levels */}
      <section className="space-y-3 rounded-card bg-surface p-4">
        <p className="text-sm text-muted">Chlorination charge levels</p>
        <p className="text-xs text-muted">
          Sets how much charge the device delivers per cycle for the Normal and High chlorination
          modes on the Home screen, as a percentage of the theoretical max charge deliverable in
          one cycle at the electrode current above. More charge produces more chlorine.
        </p>
        <CycleLengthField
          value={config?.cycle_s}
          disabled={!device?.online}
          onCommit={(v) => device?.online && updateConfig(device.id, { cycle_s: v })}
        />
        <p className="text-xs text-muted">
          Theoretical max charge this cycle at {config?.target_ma ? config.target_ma / 1000 : "—"}A:{" "}
          <span className="font-medium text-content">
            {config?.cycle_s && config?.target_ma
              ? theoreticalMaxChargeC(config.cycle_s, config.target_ma)
              : "—"}{" "}
            C
          </span>
        </p>
        <PercentChargeField
          label="Normal"
          percent={chlorinationLevels.normalPct}
          cycleSeconds={config?.cycle_s}
          targetMa={config?.target_ma}
          onCommit={(v) => setChlorinationLevels({ ...chlorinationLevels, normalPct: v })}
        />
        <PercentChargeField
          label="High"
          percent={chlorinationLevels.highPct}
          cycleSeconds={config?.cycle_s}
          targetMa={config?.target_ma}
          onCommit={(v) => setChlorinationLevels({ ...chlorinationLevels, highPct: v })}
        />
      </section>

      {/* Alert information */}
      <Button variant="secondary" onClick={() => setAlertInfoOpen(true)}>
        Alert information
      </Button>

      <PickerSheet<TankModel>
        open={tankModelOpen}
        onClose={() => setTankModelOpen(false)}
        title="Tank model"
        value={tankModel}
        options={(Object.keys(TANK_MODEL_LABEL) as TankModel[]).map((m) => ({
          value: m,
          label: TANK_MODEL_LABEL[m],
        }))}
        onSelect={setTankModel}
      />

      <PickerSheet<number>
        open={tankVolumeOpen}
        onClose={() => setTankVolumeOpen(false)}
        title="Tank volume"
        value={config?.tank_l ?? null}
        options={TANK_VOLUME_OPTIONS_L.map((l) => ({ value: l, label: `${l}L` }))}
        onSelect={(l) => device?.online && updateConfig(device.id, { tank_l: l })}
      />

      <PickerSheet<WaterSource>
        open={waterSourceOpen}
        onClose={() => setWaterSourceOpen(false)}
        title="Water source"
        value={waterSource}
        options={(Object.keys(WATER_SOURCE_LABEL) as WaterSource[]).map((s) => ({
          value: s,
          label: WATER_SOURCE_LABEL[s],
        }))}
        onSelect={(s) => device?.online && setWaterSource(device.id, s)}
      />

      <InfoSheet open={alertInfoOpen} onClose={() => setAlertInfoOpen(false)} title="Alert information">
        <div className="space-y-4">
          {ALERT_REFERENCE.map((a) => (
            <div key={a.code}>
              <p className="font-medium">{a.title}</p>
              <p className="text-sm text-muted">{a.explanation}</p>
            </div>
          ))}
        </div>
      </InfoSheet>
    </div>
  );
}

function PercentChargeField({
  label,
  percent,
  cycleSeconds,
  targetMa,
  onCommit,
}: {
  label: string;
  percent: number;
  cycleSeconds: number | undefined;
  targetMa: number | undefined;
  onCommit: (percent: number) => void;
}) {
  const [text, setText] = useState(String(percent));
  const referenceC =
    cycleSeconds && targetMa
      ? Math.round((percent / 100) * theoreticalMaxChargeC(cycleSeconds, targetMa))
      : null;

  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-sm">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          step={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const parsed = Math.round(Number(text));
            const next = Number.isFinite(parsed) && parsed >= 1 && parsed <= 100 ? parsed : percent;
            setText(String(next));
            if (next !== percent) onCommit(next);
          }}
          className="w-20 rounded-card border border-border bg-surface-muted px-3 py-2 text-right text-content"
        />
        <span className="text-xs text-muted">% ({referenceC ?? "—"} C)</span>
      </div>
    </div>
  );
}

function CycleLengthField({
  value,
  disabled,
  onCommit,
}: {
  value: number | undefined;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(value != null ? String(value) : "");

  // `value` comes from the live device config (unlike ChargeLevelField's
  // phone-local value), so it can change out from under us — e.g. once it
  // first loads after connecting, or once our own SETCFG round-trips back.
  useEffect(() => {
    setText(value != null ? String(value) : "");
  }, [value]);

  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-sm">Cycle length</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={86400}
          step={1}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const parsed = Math.round(Number(text));
            const fallback = value ?? 0;
            const next = Number.isFinite(parsed) && parsed >= 1 && parsed <= 86400 ? parsed : fallback;
            setText(String(next));
            if (next !== value) onCommit(next);
          }}
          className="w-24 rounded-card border border-border bg-surface-muted px-3 py-2 text-right text-content disabled:opacity-50"
        />
        <span className="text-xs text-muted">s</span>
      </div>
    </div>
  );
}

function TargetCurrentField({
  value,
  disabled,
  onCommit,
}: {
  value: number | undefined;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(value != null ? String(value) : "");

  // `value` comes from the live device config, so it can change out from
  // under us (initial load after connecting, or once our own SETCFG
  // round-trips back) — same reasoning as CycleLengthField.
  useEffect(() => {
    setText(value != null ? String(value) : "");
  }, [value]);

  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-sm">Target current</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={TARGET_CURRENT_MIN_MA}
          max={TARGET_CURRENT_MAX_MA}
          step={50}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const parsed = Math.round(Number(text));
            const fallback = value ?? 0;
            const next =
              Number.isFinite(parsed) && parsed >= TARGET_CURRENT_MIN_MA && parsed <= TARGET_CURRENT_MAX_MA
                ? parsed
                : fallback;
            setText(String(next));
            if (next !== value) onCommit(next);
          }}
          className="w-24 rounded-card border border-border bg-surface-muted px-3 py-2 text-right text-content disabled:opacity-50"
        />
        <span className="text-xs text-muted">mA (max {TARGET_CURRENT_MAX_MA / 1000}A)</span>
      </div>
    </div>
  );
}
