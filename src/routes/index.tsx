import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Settings as SettingsIcon, Thermometer, Zap, Droplets, HelpCircle } from "lucide-react";
import { useDevices, useCommands, sendCommand } from "@/lib/device/store";
import type { CommandEntry } from "@/lib/device/types";
import { useDeviceSummary } from "@/lib/device/useDeviceSummary";
import { startTreatment, stopTreatment, clearFault, pairDevice } from "@/lib/device/actions";
import { requestTankReading } from "@/lib/device/tank";
import { setDosingMode, type DosingMode } from "@/lib/device/dosing";
import { playModeChangeFeedback, playConfirmFeedback, playAbortFeedback } from "@/lib/ui/feedback";
import { BUILD_TAG } from "@/lib/buildInfo";
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

// Config (and therefore dosingMode, derived from config.elec_en/cycle_c) is
// otherwise only re-read after a START/STOP/SETCFG this app itself sent (see
// store.ts sendCommand's ack handler). Anything that changes elec_en outside
// that — e.g. the firmware forcing electrolysisEnabled=0 on entering a fault
// (EnterError(), BLE_DEVELOPER_GUIDE.md), or a missed/raced ack — leaves the
// local copy stale with no trigger to ever refresh it, which showed up as
// the mode toggle still saying "Off" after returning to Home even though the
// device was actually running. A light periodic GETCFG while Home is open
// bounds that staleness to a few seconds instead of indefinitely.
const CONFIG_REFRESH_MS = 10_000;

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

  useEffect(() => {
    if (!device?.online) return;
    // Immediately, not just on the interval below — otherwise returning to
    // Home right after the mode actually changed elsewhere/earlier could
    // still show the stale mode for up to CONFIG_REFRESH_MS before the
    // first tick fires (mirrors the tank effect's immediate + interval
    // pattern above).
    sendCommand(device.id, "get_config");
    const id = setInterval(() => sendCommand(device.id, "get_config"), CONFIG_REFRESH_MS);
    return () => clearInterval(id);
  }, [device?.id, device?.online]);

  if (!device) {
    return (
      <div className="stagger">
        <Header />
        <div className="surface-lift space-y-4 rounded-card border border-border-soft bg-surface p-5">
          <p className="text-muted">Connect your Njord Aqua to get started.</p>
          <Button onClick={() => void pairDevice()}>Connect device</Button>
        </div>
        <p className="mt-4 text-center text-xs text-faint">Build {BUILD_TAG}</p>
      </div>
    );
  }

  return (
    <div className="stagger space-y-6">
      <Header
        right={
          <button
            aria-label="Settings"
            onClick={() => navigate({ to: "/settings" })}
            className="press rounded-full p-1.5 text-muted"
          >
            <SettingsIcon size={21} />
          </button>
        }
      />

      <div className="flex items-baseline justify-between">
        <p className="text-sm text-muted">Overview of Tank 1</p>
        <p className="text-[0.6875rem] tracking-wide text-faint">{BUILD_TAG}</p>
      </div>

      <StatusRow
        tone={waterStatus.tone}
        label={waterStatus.label}
        message={waterStatus.message}
        onInfo={() => setInfoOpen(true)}
      />

      <div className="grid grid-cols-[1fr_1.5fr] gap-4">
        <div className="space-y-4">
          <Metric icon={Thermometer} label="Water temperature" value={
            health?.temperature.available ? `${health.temperature.celsius}°C` : "—"
          } />
          <Metric icon={Zap} label="Current watt" value={watts !== null ? `${watts.toFixed(0)} W` : "—"} />
          <Metric icon={Droplets} label="Water used today" value="Not available" muted />
        </div>

        <div className="surface-lift flex flex-col items-center rounded-card border border-border-soft bg-surface p-4">
          {/* This wrapper is what actually stretches to consume the card's
              full available height (the grid row is already stretched to
              match the metrics column) — TankGraphic grows its own image
              area to fill it, rather than being centered as a smaller fixed
              block with wasted space above/below. */}
          <div className="min-h-0 w-full flex-1">
            <TankGraphic
              percent={tank.percent}
              liters={tank.liters}
              capacityLiters={tank.capacityLiters}
              low={tank.low}
              hasReading={tank.hasReading}
            />
          </div>
          <p className="mt-3 shrink-0 text-sm font-semibold">{name}</p>
          <span
            className={cn(
              "mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium",
              device.online ? "bg-good/12 text-good" : "bg-bad/12 text-bad",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                device.online ? "animate-breathe bg-good" : "bg-bad",
              )}
            />
            {device.online ? "Connected" : "Not connected"}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Chlorination mode</p>
        <button
          aria-label="More information"
          onClick={() => setModeInfoOpen(true)}
          className="press rounded-full p-1 text-faint"
        >
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
        <div
          className="surface-lift space-y-2 rounded-card border border-border-soft bg-surface p-4"
          style={{
            backgroundImage:
              "linear-gradient(100deg, color-mix(in srgb, var(--color-warn) 10%, transparent), transparent 55%)",
          }}
        >
          <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-warn">
            Needs attention
          </p>
          {attention.map((message) => (
            <p key={message} className="text-sm leading-snug">
              {message}
            </p>
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        {actions.canStop ? (
          <Button
            variant="secondary"
            onClick={() => {
              playAbortFeedback();
              void stopTreatment(device.id);
            }}
          >
            Stop
          </Button>
        ) : null}
        {actions.canStart ? (
          <Button
            onClick={() => {
              playConfirmFeedback();
              void startTreatment(device.id);
            }}
          >
            Start
          </Button>
        ) : null}
        {actions.canClearFault ? (
          <Button
            variant="danger"
            onClick={() => {
              playAbortFeedback();
              void clearFault(device.id);
            }}
          >
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
    <div className="surface-lift rounded-card border border-border-soft bg-surface p-4">
      <div className="flex items-center gap-2 text-faint">
        <Icon size={15} strokeWidth={2.1} />
        <span className="text-[0.6875rem] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p
        className={cn(
          "tnum mt-1.5 text-[1.375rem] font-semibold leading-tight",
          muted && "text-muted text-sm font-normal",
        )}
      >
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
 *
 * When lit it genuinely emits: a breathing core, a static halo ring and a
 * faint wash across the row, so you can read "it's working" from across the
 * room without parsing the text.
 */
function ElectrolysisLed({ online, on }: { online: boolean; on: boolean }) {
  const lit = online && on;
  return (
    <div
      className="surface-lift flex items-center gap-2.5 rounded-card border border-border-soft bg-surface px-4 py-3 transition-all duration-500"
      style={
        lit
          ? {
              backgroundImage:
                "linear-gradient(100deg, color-mix(in srgb, var(--color-good) 12%, transparent), transparent 50%)",
            }
          : undefined
      }
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full transition-colors duration-500",
            lit ? "animate-breathe bg-good" : "bg-surface-raised",
          )}
          style={
            lit
              ? { boxShadow: "0 0 0 3px color-mix(in srgb, var(--color-good) 18%, transparent), 0 0 14px var(--color-good)" }
              : undefined
          }
        />
      </span>
      <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted">
        Electrolysis
      </span>
      <span
        className={cn(
          "ml-auto text-[0.6875rem] font-semibold uppercase tracking-wider transition-colors duration-500",
          lit ? "text-good" : "text-faint",
        )}
      >
        {online ? (on ? "On" : "Off") : "—"}
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
  const SELECTED_TEXT: Record<DosingMode, string> = {
    off: "text-content",
    normal: "text-bg",
    high: "text-content",
  };
  // CSS colour expressions for the sliding thumb — these feed gradients and
  // shadows, so they can't be Tailwind classes.
  const THUMB_COLOR: Record<DosingMode, string> = {
    off: "var(--color-bad)",
    normal: "var(--color-good)",
    high: "var(--color-good-strong)",
  };

  const activeIndex = Math.max(0, options.findIndex((o) => o.value === mode));
  const thumb = THUMB_COLOR[mode];

  return (
    // One thumb that slides between the three slots (and cross-fades its
    // colour) rather than three independently-toggling backgrounds — the
    // travel is what makes a mode change feel like moving a physical switch,
    // and it also visually connects the mode you left to the one you chose.
    <div className="surface-lift relative grid grid-cols-3 gap-2 rounded-card border border-border-soft bg-surface-muted p-1">
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-[calc(var(--radius-card)-0.25rem)] transition-all duration-[350ms] ease-[var(--ease-spring)]"
        style={{
          width: `calc((100% - 0.5rem) / 3)`,
          transform: `translateX(${activeIndex * 100}%)`,
          backgroundImage: `linear-gradient(to bottom, color-mix(in srgb, ${thumb} 88%, white), ${thumb})`,
          boxShadow: `0 1px 0 rgb(255 255 255 / 0.16) inset, 0 6px 16px -8px ${thumb}`,
        }}
      />
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "relative rounded-card px-3 py-3 text-sm font-semibold transition-colors duration-200",
            "active:scale-[0.97] transition-transform",
            opt.value === mode ? SELECTED_TEXT[opt.value] : "text-muted",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}


