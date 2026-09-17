import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Settings as SettingsIcon,
  HelpCircle,
  BluetoothSearching,
  AlertTriangle,
  Droplet,
  Thermometer as ThermometerIcon,
  Shield,
  Zap,
  ChevronRight,
} from "lucide-react";
import { useDevices, useCommands, sendCommand } from "@/lib/device/store";
import type { CommandEntry } from "@/lib/device/types";
import { useDeviceSummary } from "@/lib/device/useDeviceSummary";
import { startTreatment, stopTreatment, clearFault, pairDevice } from "@/lib/device/actions";
import { requestTankReading } from "@/lib/device/tank";
import { logTankLevel, useTankUsage } from "@/lib/device/tankLog";
import { setDosingMode, type DosingMode } from "@/lib/device/dosing";
import { formatRelativeAgo } from "@/lib/device/history";
import { useGaugeRanges } from "@/lib/settings/gaugeSettings";
import { useTreatmentMinutes } from "@/lib/settings/waterTreatmentSettings";
import { useTreatmentStatus } from "@/lib/device/waterTreatmentTimer";
import { playModeChangeFeedback, playConfirmFeedback, playAbortFeedback } from "@/lib/ui/feedback";
import { BUILD_TAG } from "@/lib/buildInfo";
import { Header } from "@/components/layout/Header";
import { WaterStatusPanel } from "@/components/device/WaterStatusPanel";
import { TankLevelRing } from "@/components/device/TankLevelRing";
import { DeviceCard } from "@/components/device/DeviceCard";
import { ElectrolysisStatusPanel } from "@/components/device/ElectrolysisStatusPanel";
import { InfoSheet } from "@/components/ui/InfoSheet";
import { Button } from "@/components/ui/Button";
import { GaugeArc } from "@/components/ui/GaugeArc";
import { Thermometer } from "@/components/ui/Thermometer";
import { EmptyState } from "@/components/ui/Skeleton";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: HomeScreen,
});

// Sonar readings are not pushed continuously by the firmware — request a
// fresh one periodically while Home is open so the tank graphic stays
// reasonably current (uses the existing, already-supported sonar_shot
// command; see lib/device/tank.ts). Each tick also logs the resulting fill
// level (lib/device/tankLog.ts), which is what the "Water used" figure is
// derived from — so this cadence is also the log's sampling interval.
const TANK_REFRESH_MS = 5_000;

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
    device, name, status, health, watts, tank, dosingMode, cycleSeconds, targetMa,
    electrolysisOn, electrolysisState, actions, attention,
  } = summary;
  const [infoOpen, setInfoOpen] = useState(false);
  const [modeInfoOpen, setModeInfoOpen] = useState(false);

  // Latest tank summary, read from the refresh timer's interval callback
  // below (see logTankLevel) without re-creating that timer on every tick.
  const tankRef = useRef(tank);
  useEffect(() => {
    tankRef.current = tank;
  }, [tank]);
  const tankUsage = useTankUsage(device?.id);

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

  // Full-scale values for the two speed dials. Installation-specific, so
  // they're phone-local settings rather than constants (see gaugeSettings).
  const gaugeRanges = useGaugeRanges();

  // Placeholder "is the water safe" heuristic: a plain timer since
  // treatment last started (see waterTreatmentTimer.ts for why this and
  // not a real measurement). `active` mirrors the same flag the
  // electrolysis status panel and badge use below, so all three can never
  // disagree about whether treatment is currently running.
  const treatmentMinutes = useTreatmentMinutes();
  const treatmentStatus = useTreatmentStatus(
    device?.id,
    Boolean(device?.online),
    electrolysisOn && Boolean(device?.online),
    treatmentMinutes,
  );

  // Water status is deliberately just the safe/being-treated/not-treated
  // timer heuristic — a real device fault is a separate concern and only
  // ever shown in the "Needs attention" list below (see attention, sourced
  // from device.alarms), so the same fault is never spelled out twice on
  // Home. Big and simple: red/yellow/green off the timer, or a neutral
  // "connect the device" state when there's nothing to report.
  const waterPanel = !device?.online
    ? { tone: "info" as const, headline: "Unknown", message: "Connect the device to see water status." }
    : treatmentStatus.status === "green"
      ? { tone: "good" as const, headline: "Safe to use", message: "Water is safe to use." }
      : treatmentStatus.status === "yellow"
        ? {
            tone: "warn" as const,
            headline: "Being treated",
            message: `Water is being treated — wait about ${treatmentStatus.remainingMinutes} more minute${treatmentStatus.remainingMinutes === 1 ? "" : "s"}.`,
          }
        : { tone: "bad" as const, headline: "Not treated", message: "Water is not treated — turn on treatment." };

  // One place deciding what the electrolysis badge says, so the wording and
  // the cell animation can never disagree about whether it's running.
  const electrolysisBadge = !device?.online
    ? { tone: "bad" as const, label: "Offline" }
    : electrolysisState === "on"
      ? { tone: "good" as const, label: "Running" }
      : electrolysisState === "waiting"
        ? { tone: "warn" as const, label: "Done for cycle" }
        : { tone: "bad" as const, label: "Off" };

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
    const id = setInterval(() => {
      requestTankReading(device.id);
      // Log whatever level is currently known (the previous tick's reading
      // — the fresh one just requested above arrives asynchronously over
      // BLE). Close enough at this cadence, and simpler than plumbing the
      // BLE response back into this effect.
      const t = tankRef.current;
      if (t.hasReading && t.liters != null) logTankLevel(device.id, t.liters);
    }, TANK_REFRESH_MS);
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
      <div className="stagger space-y-6">
        <Header />
        <EmptyState
          icon={BluetoothSearching}
          title="No device paired"
          description="Connect your Njord Aqua to see water status, tank level and live readings."
          action={<Button onClick={() => void pairDevice()}>Connect device</Button>}
        />
        <p className="text-center type-label text-faint">Build {BUILD_TAG}</p>
      </div>
    );
  }

  return (
    <div className="stagger space-y-6">
      <Header
        tagline="Cleaner water, brighter tomorrow"
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
        <h1 className="type-title text-content">Tank 1</h1>
        <p className="type-label text-faint">{BUILD_TAG}</p>
      </div>

      <DeviceCard
        name={name}
        online={device.online}
        reconnecting={device.reconnecting}
        freshness={
          device.online && device.lastUpdate
            ? `Updated ${formatRelativeAgo(device.lastUpdate)}`
            : undefined
        }
      />

      <WaterStatusPanel
        tone={waterPanel.tone}
        headline={waterPanel.headline}
        message={waterPanel.message}
        onInfo={() => setInfoOpen(true)}
      />

      {/* Home's four "what's happening right now" panels, as a 2x2 grid:
          tank state, temperature, the control that drives treatment, and
          the live status that control produces. Four equal-width cards
          rather than one or two long ones, so all four are visible together
          with minimal scrolling. Grid (not flex) so both rows independently
          match the height of their taller card, with each panel's own
          content centered in the space that leaves rather than stretched. */}
      <div className="grid grid-cols-2 gap-3">
        {/* TANK STATUS — a circular level ring instead of the old tank
            illustration, per the glass facelift's "circular progress
            indicator and a large percentage" spec. Still on a deep-blue
            backdrop (now translucent, not solid) so the ring's track reads
            clearly against it. */}
        <div className="surface-lift flex min-w-0 flex-col overflow-hidden rounded-card border border-white/15 bg-brand-deep/45 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <Droplet size={14} className="shrink-0 text-brand" />
              <p className="text-[0.8125rem] font-semibold leading-tight tracking-tight text-content">Tank status</p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-faint" />
          </div>

          <div className="flex flex-1 items-center justify-center py-3">
            <TankLevelRing
              percent={tank.hasReading ? (tank.percent ?? 0) : 0}
              hasReading={tank.hasReading}
              low={tank.low}
              size={104}
            />
          </div>

          {/* Volume + 24h usage as a typographic strip rather than one
              run-on caption: the figure carries the weight, the word beneath
              it stays small and quiet, so the numbers are scannable at a
              glance and the labels never compete with them. */}
          <div className="grid grid-cols-2 divide-x divide-white/10 border-t border-white/10 pt-1">
            <TankStat
              value={tank.hasReading ? tank.liters : null}
              unit="L"
              label={`of ${tank.capacityLiters}L`}
              emphasis={tank.low ? "warn" : "normal"}
            />
            {/* Water used — the firmware has no flow sensor, so this is a
                rough figure reconstructed from the logged tank level (sum of
                drops over the last 24h; a rise is a refill, not usage — see
                lib/device/tankLog.ts). Blank until enough samples exist. */}
            <TankStat value={tankUsage.usedLiters} unit="L" label="Used" emphasis="quiet" />
          </div>
        </div>

        {/* TEMPERATURE — its own panel now rather than sharing one with
            power, so the thermometer gets a whole column to itself instead
            of being squeezed down to fit alongside a second gauge. Tinted
            electric cyan (the app's one interactive/accent colour) rather
            than plain white, per spec. */}
        <div className="surface-lift flex min-w-0 flex-col overflow-hidden rounded-card border border-white/15 bg-water/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <ThermometerIcon size={14} className="shrink-0 text-brand" />
              <p className="text-[0.8125rem] font-semibold leading-tight tracking-tight text-content">Temperature</p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-faint" />
          </div>
          <div className="flex flex-1 items-center justify-center px-1 py-2">
            <Thermometer
              value={health?.temperature.available ? health.temperature.celsius : null}
              max={gaugeRanges.tempMaxC}
              unit="°C"
              label="Water temp"
              size={124}
              color="var(--color-brand)"
              trackColor="rgb(255 255 255 / 0.14)"
              textClassName="text-content"
              subTextClassName="text-faint"
            />
          </div>
        </div>

        {/* DISINFECTION CONTROL — the control that drives the process: set
            it here, see its effect over in Live electrolysis status. */}
        <div className="surface-lift flex min-w-0 flex-col overflow-hidden rounded-card border border-white/15 bg-water/40 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-1.5">
              <Shield size={14} className="mt-0.5 shrink-0 text-brand" />
              <p className="text-[0.75rem] font-semibold leading-tight tracking-tight text-content">Disinfection control</p>
            </div>
            <button
              aria-label="More information"
              onClick={() => setModeInfoOpen(true)}
              className="press shrink-0 rounded-full p-1 text-faint"
            >
              <HelpCircle size={16} />
            </button>
          </div>
          <div className="flex flex-1 flex-col justify-center pt-3">
            <p className="mb-1.5 type-cap text-faint">Treatment setting</p>
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
          </div>
        </div>

        {/* LIVE ELECTROLYSIS STATUS — everything about the process while
            it's actually running: a clean semi-circular gauge of the
            cycle's power draw (shown as a percentage of the configured
            max, per spec) and the plain-language status the badge carries. */}
        <div className="surface-lift flex min-w-0 flex-col overflow-hidden rounded-card border border-white/15 bg-water/40 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-1.5">
              <Zap size={14} className="mt-0.5 shrink-0 text-brand" />
              <p className="text-[0.75rem] font-semibold leading-tight tracking-tight text-content">Live electrolysis status</p>
            </div>
            <ChevronRight size={16} className="mt-0.5 shrink-0 text-faint" />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 pt-2">
            <GaugeArc
              percent={watts != null && gaugeRanges.wattsMax > 0 ? (watts / gaugeRanges.wattsMax) * 100 : 0}
              hasReading={watts != null}
              label="Power"
              size={112}
              // "waiting" = this cycle's charge target is already reached and
              // the electrode is holding for the next cycle — a normal part of
              // the dosing workflow, not a fault, but a flat "0%" reads as
              // broken/stuck. Say so explicitly instead.
              placeholder={electrolysisState === "waiting" ? "Waiting\u2026" : undefined}
            />
            <ElectrolysisStatusPanel
              tone={electrolysisBadge.tone}
              label={electrolysisBadge.label}
              active={electrolysisOn && device.online}
              showCaption={false}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {attention.length > 0 ? (
        <div className="surface-lift relative overflow-hidden rounded-card border border-border-soft bg-surface py-4 pl-[1.125rem] pr-4">
          <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-full bg-warn" />
          <div className="flex items-center gap-1.5 text-warn">
            <AlertTriangle size={13} strokeWidth={2.2} />
            <p className="type-cap">Needs attention</p>
          </div>
          <div className="mt-2 space-y-1.5">
            {attention.map((message) => (
              <p key={message} className="text-sm leading-snug text-content">
                {message}
              </p>
            ))}
          </div>
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

      <InfoSheet open={infoOpen} onClose={() => setInfoOpen(false)} title={waterPanel.headline}>
        <p className="text-muted">{waterPanel.message}</p>
        {status.detail ? <p className="mt-2 text-muted">{status.detail}</p> : null}
        {/* The disclaimer this heuristic needs: the device has no sensor
            that measures whether the water is actually safe, so outside of
            a real fault, this is a plain timer since treatment last
            started, not a verified reading. */}
        <p className="mt-3 text-xs leading-relaxed text-faint">
          The device has no water-safety sensor, so "safe to use" is based on how long treatment
          has been running continuously, not a direct measurement. The wait time is adjustable in
          Settings.
        </p>
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

/**
 * One figure in the tank card's bottom strip. Sits on the dark brand-deep
 * surface, so the colours here are white-on-dark rather than the usual
 * token pairs. `quiet` is for the fixed capacity figure — it's a setting,
 * not a reading, so it shouldn't pull the same visual weight as the live
 * numbers beside it.
 */
function TankStat({
  value,
  unit,
  label,
  emphasis,
}: {
  value: number | null;
  unit: string;
  label: string;
  emphasis: "normal" | "warn" | "quiet";
}) {
  return (
    <div className="flex min-w-0 flex-col items-center px-1 py-3">
      {value === null ? (
        <span className="type-value text-on-fill/40">—</span>
      ) : (
        <AnimatedNumber
          value={value}
          decimals={0}
          unit={unit}
          className={cn(
            "text-lg font-semibold leading-tight tabular-nums",
            emphasis === "warn" ? "text-warn" : emphasis === "quiet" ? "text-on-fill/55" : "text-on-fill",
          )}
          unitClassName={cn(
            "ml-0.5 text-[11px] font-medium",
            emphasis === "warn" ? "text-warn/80" : "text-on-fill/50",
          )}
        />
      )}
      <p className="mt-0.5 truncate type-cap text-on-fill/50">{label}</p>
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
    off: "text-on-fill",
    normal: "text-on-fill",
    high: "text-on-fill",
  };
  // CSS colour expressions for the sliding thumb — flat fill, no gradient.
  // "High" uses the restrained accent colour rather than a second shade of
  // green, since off/normal already carry the real bad/good device-state
  // meaning and high is just a stronger selection of the same "good" state.
  const THUMB_COLOR: Record<DosingMode, string> = {
    off: "var(--color-bad)",
    normal: "var(--color-good)",
    high: "var(--color-accent)",
  };

  const activeIndex = Math.max(0, options.findIndex((o) => o.value === mode));
  const thumb = THUMB_COLOR[mode];

  return (
    // One thumb that slides between the three slots (and cross-fades its
    // colour) rather than three independently-toggling backgrounds — the
    // travel is what makes a mode change feel like moving a physical switch,
    // and it also visually connects the mode you left to the one you chose.
    // Sits on a translucent-glass panel, so the trough is a soft dark film
    // rather than the light-surface tokens used elsewhere.
    <div className="relative grid grid-cols-3 gap-2 rounded-card border border-white/10 bg-black/20 p-1">
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-[calc(var(--radius-card)-0.25rem)] transition-all duration-200 ease-[var(--ease-standard)]"
        style={{
          width: `calc((100% - 0.5rem) / 3)`,
          transform: `translateX(${activeIndex * 100}%)`,
          backgroundColor: thumb,
          // A thin edge glow in the thumb's own colour — "active selections
          // gain a stronger surface and a thin edge glow" per spec, kept in
          // each mode's own semantic colour (red/green/accent) rather than a
          // generic cyan, since that colour is what actually carries the
          // off/normal/high meaning and shouldn't be flattened away.
          boxShadow: `0 0 0 1px color-mix(in srgb, ${thumb} 70%, transparent), 0 0 14px color-mix(in srgb, ${thumb} 55%, transparent)`,
        }}
      />
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "relative rounded-card px-1 py-3 text-xs font-medium transition-colors duration-150",
            "active:scale-[0.98] transition-transform",
            opt.value === mode ? SELECTED_TEXT[opt.value] : "text-on-fill/65",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}


