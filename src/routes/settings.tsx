import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bluetooth, BluetoothOff, Check } from "lucide-react";
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
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  component: SettingsScreen,
});

const TANK_VOLUME_OPTIONS_L = [500, 1000, 1500, 2000, 3000, 5000];

/**
 * Brief "Saved" confirmation after a field commits. These settings write
 * straight through on blur with no Save button, so without an explicit
 * acknowledgement there is nothing to tell the user the change actually
 * took — the field just looks the same as before they touched it.
 */
function useSavedFlash(ms = 1600) {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const flash = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setSaved(true);
    timer.current = setTimeout(() => setSaved(false), ms);
  }, [ms]);

  return { saved, flash };
}

/** The "Saved" tick itself — shared by every committed field below. */
function SavedFlash({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex animate-pop items-center gap-1 type-label text-good">
      <Check size={13} strokeWidth={2.6} />
      Saved
    </span>
  );
}

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
    <div className="stagger space-y-6">
      <Header />
      <h1 className="type-title">Settings</h1>

      {/* Bluetooth */}
      <section>
        {device?.online ? (
          <div className="surface-lift space-y-3 rounded-card border border-border-soft bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="type-cap text-faint">Bluetooth</p>
              <StatusBadge tone="good" label="Connected" icon={Bluetooth} />
            </div>
            <p className="text-sm text-muted">
              Connected to <span className="font-medium text-content">{device.name}</span>
            </p>
            <Button variant="secondary" onClick={() => void forgetDevice(device.id)}>
              Forget device
            </Button>
          </div>
        ) : device ? (
          <div className="surface-lift space-y-3 rounded-card border border-border-soft bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="type-cap text-faint">Bluetooth</p>
              <StatusBadge tone="bad" label="Offline" icon={BluetoothOff} />
            </div>
            <p className="text-sm text-muted">
              Not connected to <span className="font-medium text-content">{device.name}</span>
            </p>
            <Button onClick={() => void reconnectDevice(device.id)}>Reconnect</Button>
            <Button variant="secondary" onClick={() => void forgetDevice(device.id)}>
              Forget device
            </Button>
          </div>
        ) : (
          <Button onClick={() => void pairDevice()}>Pair device</Button>
        )}
      </section>

      {/* Tank setup */}
      <section>
        <SectionHeader title="Tank setup" />
        <div className="surface-lift overflow-hidden rounded-card border border-border-soft">
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
        <SectionHeader title="Water source" />
        <div className="surface-lift overflow-hidden rounded-card border border-border-soft">
          <ListRow
            label="Source type"
            value={waterSource ? WATER_SOURCE_LABEL[waterSource] : "Not set"}
            onClick={() => setWaterSourceOpen(true)}
            disabled={!device?.online}
          />
        </div>
      </section>

      {/* Pre-chlorination */}
      <section className="surface-lift rounded-card border border-border-soft bg-surface p-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <p className="type-cap text-faint">Pre-chlorination of incoming water</p>
          {/* The value sits in a tinted pill rather than as loose text, so
              the current setting reads as the slider's own readout. */}
          <span className="tnum shrink-0 rounded-full bg-brand/12 px-2.5 py-1 text-sm font-semibold text-brand">
            {prechlorination.toFixed(1)}
            <span className="ml-0.5 type-unit font-medium text-brand/70">mg/L</span>
          </span>
        </div>
        <input
          type="range"
          min={PRECHLORINATION_MIN_MG_L}
          max={PRECHLORINATION_MAX_MG_L}
          step={PRECHLORINATION_STEP_MG_L}
          value={prechlorination}
          disabled={!device?.online}
          onChange={(e) => device?.online && setPrechlorination(device.id, Number(e.target.value))}
          className="h-6 w-full accent-[var(--color-brand)] disabled:opacity-50"
        />
        {/* Endpoint labels so the slider's range is legible without dragging. */}
        <div className="mt-0.5 flex justify-between type-label text-faint">
          <span>{PRECHLORINATION_MIN_MG_L.toFixed(1)}</span>
          <span>{PRECHLORINATION_MAX_MG_L.toFixed(1)} mg/L</span>
        </div>
        {!device?.online ? (
          <p className="mt-2 type-label text-faint">Connect to the device to change this setting.</p>
        ) : null}
      </section>

      {/* Electrode current */}
      <section className="surface-lift space-y-3 rounded-card border border-border-soft bg-surface p-4">
        <p className="type-cap text-faint">Electrode current</p>
        <p className="text-xs leading-relaxed text-muted">
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
      <section className="surface-lift space-y-3 rounded-card border border-border-soft bg-surface p-4">
        <p className="type-cap text-faint">Chlorination charge levels</p>
        <p className="text-xs leading-relaxed text-muted">
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
          <span className="tnum font-semibold text-content">
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
  const { saved, flash } = useSavedFlash();
  const referenceC =
    cycleSeconds && targetMa
      ? Math.round((percent / 100) * theoreticalMaxChargeC(cycleSeconds, targetMa))
      : null;

  return (
    <div className="flex items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-sm text-content">
        {label}
        <SavedFlash show={saved} />
      </label>
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
            if (next !== percent) {
              onCommit(next);
              flash();
            }
          }}
          className={cn(
            "w-20 rounded-inner border bg-surface px-3 py-2.5 text-right tnum text-content transition-colors",
            "focus:border-brand focus:outline-none",
            saved ? "border-good" : "border-border",
          )}
        />
        <span className="type-label text-faint">% ({referenceC ?? "—"} C)</span>
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
  const { saved, flash } = useSavedFlash();

  // `value` comes from the live device config (unlike ChargeLevelField's
  // phone-local value), so it can change out from under us — e.g. once it
  // first loads after connecting, or once our own SETCFG round-trips back.
  useEffect(() => {
    setText(value != null ? String(value) : "");
  }, [value]);

  return (
    <div className="flex items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-sm text-content">
        Cycle length
        <SavedFlash show={saved} />
      </label>
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
            if (next !== value) {
              onCommit(next);
              flash();
            }
          }}
          className={cn(
            "w-24 rounded-inner border bg-surface px-3 py-2.5 text-right tnum text-content transition-colors",
            "focus:border-brand focus:outline-none disabled:opacity-50",
            saved ? "border-good" : "border-border",
          )}
        />
        <span className="type-label text-faint">s</span>
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
  const { saved, flash } = useSavedFlash();

  // `value` comes from the live device config, so it can change out from
  // under us (initial load after connecting, or once our own SETCFG
  // round-trips back) — same reasoning as CycleLengthField.
  useEffect(() => {
    setText(value != null ? String(value) : "");
  }, [value]);

  return (
    <div className="flex items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-sm text-content">
        Target current
        <SavedFlash show={saved} />
      </label>
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
            if (next !== value) {
              onCommit(next);
              flash();
            }
          }}
          className={cn(
            "w-24 rounded-inner border bg-surface px-3 py-2.5 text-right tnum text-content transition-colors",
            "focus:border-brand focus:outline-none disabled:opacity-50",
            saved ? "border-good" : "border-border",
          )}
        />
        <span className="type-label text-faint">mA (max {TARGET_CURRENT_MAX_MA / 1000}A)</span>
      </div>
    </div>
  );
}
