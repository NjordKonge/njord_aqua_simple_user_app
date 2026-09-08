import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Settings as SettingsIcon, Thermometer, Zap, Droplets, HelpCircle } from "lucide-react";
import { useDevices, useCommands } from "@/lib/device/store";
import type { CommandEntry } from "@/lib/device/types";
import { useDeviceSummary } from "@/lib/device/useDeviceSummary";
import { startTreatment, stopTreatment, clearFault, pairDevice } from "@/lib/device/actions";
import { requestTankReading } from "@/lib/device/tank";
import { setDosingMode, type DosingMode } from "@/lib/device/dosing";
import { playModeChangeFeedback } from "@/lib/ui/feedback";
import { Header } from "@/components/layout/Header";
import { StatusRow } from "@/components/device/StatusRow";
import { TankGraphic } from "@/components/device/TankGraphic";
import { InfoSheet } from "@/components/ui/InfoSheet";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: HomeScreen,
});

// Sonar readings are not pushed continuously by the firmware — request a
// fresh one periodically while Home is open so the tank graphic stays
// reasonably current (uses the existing, already-supported sonar_shot
// command; see lib/device/tank.ts).
const TANK_REFRESH_MS = 30_000;

function HomeScreen() {
  const navigate = useNavigate();
  const devices = useDevices();
  const deviceId = devices[0]?.id;
  const summary = useDeviceSummary(deviceId);
  const {
    device, name, status, waterStatus, health, watts, tank, dosingMode, cycleSeconds, targetMa,
    electrolysisOn, actions, attention,
  } = summary;
  const [infoOpen, setInfoOpen] = useState(false);
  const [modeInfoOpen, setModeInfoOpen] = useState(false);

  // Optimistic mode display: SETCFG/START/STOP round-trip over BLE (ack,
  // then a separate config re-read) before `dosingMode` derived from the
  // real config catches up — visibly laggy otherwise. Show the tapped mode
  // immediately, then let it settle once the device confirms.
  //
  // Reconciliation is tied to the actual command's outcome (via useCommands,
  // which re-renders whenever any command's status changes) rather than a
  // fixed timeout: an earlier version cleared `pendingMode` after a flat 6s,
  // which — under normal BLE latency variance — would occasionally fire
  // before the real confirmation arrived, flashing back to the OLD mode for
  // a moment before flipping to the new one once refreshConfig caught up.
  // That looked exactly like "the mode switches by itself". Waiting for the
  // command's own resolution (it already carries a 5s ack timeout, see
  // store.ts sendCommand) avoids that false revert.
  const [pendingMode, setPendingMode] = useState<DosingMode | null>(null);
  const pendingEntryRef = useRef<CommandEntry | null>(null);
  const displayedMode = pendingMode ?? dosingMode;
  const commands = useCommands(device?.id);

  useEffect(() => {
    if (pendingMode === null) return;
    if (dosingMode === pendingMode) {
      setPendingMode(null);
      pendingEntryRef.current = null;
      return;
    }
    if (pendingEntryRef.current?.status === "error") {
      // The command itself failed (device not connected, timeout, NACK) —
      // stop showing the tapped mode and fall back to the real one.
      setPendingMode(null);
      pendingEntryRef.current = null;
    }
    // `commands` isn't read directly, but useCommands(device.id) re-renders
    // this component whenever any command for this device changes status,
    // which is what lets the check above see the entry's latest status.
  }, [dosingMode, pendingMode, commands]);

  useEffect(() => {
    if (!device?.online) return;
    requestTankReading(device.id);
    const id = setInterval(() => requestTankReading(device.id), TANK_REFRESH_MS);
    return () => clearInterval(id);
  }, [device?.id, device?.online]);

  if (!device) {
    return (
      <div>
        <Header />
        <div className="space-y-4 rounded-card bg-surface p-5">
          <p className="text-muted">Connect your Njord Aqua to get started.</p>
          <Button onClick={() => void pairDevice()}>Connect device</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header
        right={
          <button aria-label="Settings" onClick={() => navigate({ to: "/settings" })}>
            <SettingsIcon size={22} className="text-muted" />
          </button>
        }
      />

      <p className="text-sm text-muted">Overview of Tank 1</p>

      <StatusRow
        tone={waterStatus.tone}
        label={waterStatus.label}
        message={waterStatus.message}
        onInfo={() => setInfoOpen(true)}
      />

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-4">
          <Metric icon={Thermometer} label="Water temperature" value={
            health?.temperature.available ? `${health.temperature.celsius}°C` : "—"
          } />
          <Metric icon={Zap} label="Current watt" value={watts !== null ? `${watts.toFixed(0)} W` : "—"} />
          <Metric icon={Droplets} label="Water used today" value="Not available" muted />
        </div>

        <div className="flex flex-col items-center justify-start rounded-card bg-surface p-4">
          <TankGraphic
            percent={tank.percent}
            liters={tank.liters}
            capacityLiters={tank.capacityLiters}
            low={tank.low}
            hasReading={tank.hasReading}
          />
          <p className="mt-3 text-sm font-medium">{name}</p>
          <p className={cn("text-xs", device.online ? "text-good" : "text-bad")}>
            {device.online ? "Connected" : "Not connected"}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Chlorination mode</p>
        <button aria-label="More information" onClick={() => setModeInfoOpen(true)} className="text-muted">
          <HelpCircle size={18} />
        </button>
      </div>
      <ElectrolysisLed online={device.online} on={electrolysisOn} />
      <DosingModeToggle
        mode={displayedMode}
        onChange={(mode) => {
          setPendingMode(mode);
          playModeChangeFeedback(mode);
          // setDosingMode is async (STOP is awaited before SETCFG/START are
          // sent, in series). onEntry reports each step's command entry as
          // it's sent, so the ref always reflects the currently in-flight
          // (or just-failed) command instead of only the last one.
          pendingEntryRef.current = null;
          void setDosingMode(device.id, mode, cycleSeconds, targetMa, (entry) => {
            pendingEntryRef.current = entry;
          });
        }}
      />

      {attention.length > 0 ? (
        <div className="space-y-2 rounded-card bg-surface p-4">
          <p className="text-sm text-muted">Needs attention</p>
          {attention.map((message) => (
            <p key={message} className="text-sm">
              {message}
            </p>
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        {actions.canStop ? (
          <Button variant="secondary" onClick={() => void stopTreatment(device.id)}>
            Stop
          </Button>
        ) : null}
        {actions.canStart ? (
          <Button onClick={() => void startTreatment(device.id)}>Start</Button>
        ) : null}
        {actions.canClearFault ? (
          <Button variant="danger" onClick={() => void clearFault(device.id)}>
            Reset fault
          </Button>
        ) : null}
      </div>

      <InfoSheet open={infoOpen} onClose={() => setInfoOpen(false)} title={waterStatus.label}>
        <p className="text-muted">{waterStatus.message}</p>
        {status.detail ? <p className="mt-2 text-muted">{status.detail}</p> : null}
      </InfoSheet>

      <InfoSheet open={modeInfoOpen} onClose={() => setModeInfoOpen(false)} title="Chlorination mode">
        <div className="space-y-3 text-muted">
          <p>
            <span className="font-medium text-content">Off</span> — stops chlorination. The device
            stays connected but does not run electrolysis.
          </p>
          <p>
            <span className="font-medium text-content">Normal</span> and{" "}
            <span className="font-medium text-content">High</span> both run chlorination — they
            differ only in how much charge the device delivers per cycle. Delivering more charge
            produces more chlorine, so High results in a higher chlorine concentration than
            Normal.
          </p>
          <p>
            The exact charge level each mode targets can be tuned in Settings to match this
            installation.
          </p>
        </div>
      </InfoSheet>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon: typeof Thermometer;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-card bg-surface p-4">
      <div className="flex items-center gap-2 text-muted">
        <Icon size={16} />
        <span className="text-xs">{label}</span>
      </div>
      <p className={cn("mt-1 text-xl font-semibold", muted && "text-muted text-base font-normal")}>
        {value}
      </p>
    </div>
  );
}

/**
 * Physical-LED-style indicator for whether the electrode is actively being
 * driven right now. Sourced straight from the device's live `elec_on`
 * status field (not from the app's dosingMode/config assumptions) so it
 * reflects reality even during a cycle's REST phase, faults, or offline.
 */
function ElectrolysisLed({ online, on }: { online: boolean; on: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-card bg-surface px-4 py-2.5">
      <span
        className={cn(
          "h-2.5 w-2.5 shrink-0 rounded-full",
          online ? (on ? "bg-good" : "bg-border") : "bg-border",
        )}
      />
      <span className="text-xs text-muted">
        Electrolysis {online ? (on ? "ON" : "OFF") : "—"}
      </span>
    </div>
  );
}

function DosingModeToggle({
  mode,
  onChange,
}: {
  mode: DosingMode;
  onChange: (mode: DosingMode) => void;
}) {
  const options: Array<{ value: DosingMode; label: string }> = [
    { value: "off", label: "Off" },
    { value: "normal", label: "Normal" },
    { value: "high", label: "High" },
  ];
  // Static lookup (never build Tailwind class names via template literals —
  // the JIT scanner won't pick them up).
  const SELECTED_BG: Record<DosingMode, string> = {
    off: "bg-bad text-content",
    normal: "bg-good text-bg",
    high: "bg-good-strong text-content",
  };
  return (
    <div className="grid grid-cols-3 gap-2 rounded-card bg-surface-muted p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-card px-3 py-3 text-sm font-medium transition-colors",
            opt.value === mode ? SELECTED_BG[opt.value] : "text-muted",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

