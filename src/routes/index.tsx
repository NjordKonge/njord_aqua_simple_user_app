import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Settings as SettingsIcon,
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

// Static lookups for the electrolysis status dot+label (good/warn/bad only
// — this badge never shows "info"). Module-level and literal (never built
// via template literals) so the Tailwind JIT scanner picks them up.
const BADGE_TEXT: Record<"good" | "warn" | "bad", string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
};
const BADGE_DOT: Record<"good" | "warn" | "bad", string> = {
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
};

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
    <div className="stagger space-y-4">
      <Header
        tagline={"Cleaner water\nBrighter tomorrow"}
        right={
          <button
            aria-label="Settings"
            onClick={() => navigate({ to: "/settings" })}
            className="press surface-lift flex h-10 w-10 items-center justify-center rounded-full border border-border-soft bg-surface text-content"
          >
            <SettingsIcon size={19} />
          </button>
        }
      />

      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-content">Tank 1</h1>
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
      <div className="grid grid-cols-2 gap-2.5">
        {/* TANK STATUS — a circular level ring instead of the old tank
            illustration, per the glass facelift's "circular progress
            indicator and a large percentage" spec. Still on a deep-blue
            backdrop (now translucent, not solid) so the ring's track reads
            clearly against it. */}
        <div className="surface-lift flex min-w-0 flex-col overflow-hidden rounded-card border border-white/15 bg-brand-deep/45 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <Droplet size={14} className="shrink-0 text-brand" />
              <p className="text-[0.8125rem] font-semibold leading-tight tracking-tight text-content">Tank level</p>
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

          {/* Volume, centered under the ring — matches the reference's
              single stacked "value / of capacity" readout rather than a
              divided table strip. No hairline above it (the reference has
              no divider here, just spacing) — low-tank still colors the
              ring itself, but the volume figure stays plain white so a low
              reading never looks like an error state. 24h usage is kept,
              just folded in as a small unobtrusive third line rather than
              its own column, so the figure isn't lost even though the
              reference doesn't show it. */}
          <div className="flex flex-col items-center gap-0.5 pt-1 text-center">
            <AnimatedNumber
              value={tank.hasReading ? tank.liters : null}
              decimals={0}
              unit=" L"
              className="text-lg font-semibold tabular-nums text-content"
              unitClassName="text-content"
            />
            <p className="type-cap text-faint">of {tank.capacityLiters} L</p>
            {/* Water used — the firmware has no flow sensor, so this is a
                rough figure reconstructed from the logged tank level (sum of
                drops over the last 24h; a rise is a refill, not usage — see
                lib/device/tankLog.ts). Blank until enough samples exist. */}
            {tankUsage.usedLiters != null ? (
              <p className="text-[0.625rem] font-medium text-faint/70">{tankUsage.usedLiters} L used today</p>
            ) : null}
          </div>
        </div>

        {/* TEMPERATURE — its own panel now rather than sharing one with
            power, so the thermometer gets a whole column to itself instead
            of being squeezed down to fit alongside a second gauge. Tinted
            electric cyan (the app's one interactive/accent colour) rather
            than plain white, per spec. */}
        <div className="surface-lift flex min-w-0 flex-col overflow-hidden rounded-card border border-white/15 bg-water/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <ThermometerIcon size={14} className="shrink-0 text-brand" />
              <p className="text-[0.8125rem] font-semibold leading-tight tracking-tight text-content">Temperature</p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-faint" />
          </div>
          <div className="relative flex flex-1 items-center justify-center overflow-hidden px-1 py-1">
            {/* Small decorative ripple — purely ambient texture (like the
                background bubbles/rays), not a real chart of readings, so
                it never claims to represent data that isn't tracked. Sits
                behind the thermometer (z-0, low opacity) rather than as its
                own strip, and every control point is an explicit
                coordinate inside the viewBox (no chained `T` reflections,
                which is what previously let the curve's amplitude grow
                past the box each segment and spike outside the card). */}
            <svg
              viewBox="0 0 96 24"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-x-1 top-1 z-0 h-4 w-[calc(100%-0.5rem)] overflow-hidden text-brand/25"
              aria-hidden
            >
              <path
                d="M2 14 C 10 6, 14 6, 22 12 C 30 18, 34 18, 42 11 C 50 4, 54 4, 62 12 C 70 20, 74 20, 82 12 C 87 8, 90 8, 94 11"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              />
            </svg>
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
              showScale={false}
              className="relative z-10"
            />
          </div>
        </div>

        {/* DISINFECTION CONTROL — the control that drives the process: set
            it here, see its effect over in Live electrolysis status. No
            trailing icon (the reference keeps this card chrome-free) — the
            header row itself is the info-sheet trigger instead of a
            separate button, so the affordance isn't lost, just less loud. */}
        <div className="surface-lift flex min-w-0 flex-col overflow-hidden rounded-card border border-white/15 bg-water/40 p-3">
          <button
            aria-label="Disinfection control — more information"
            onClick={() => setModeInfoOpen(true)}
            className="press flex min-w-0 items-center gap-1.5 text-left"
          >
            <Shield size={14} className="shrink-0 text-brand" />
            <p className="text-[0.75rem] font-semibold leading-tight tracking-tight text-content">Disinfection control</p>
          </button>
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
            cycle's actual power draw in watts (not a bare percentage —
            watts is the figure that means something on its own) and the
            plain-language status the badge carries, folded onto the title
            row as a compact dot + label rather than its own line. No
            trailing icon, matching the reference — this card has no
            secondary action, so there's nothing for one to trigger. */}
        <div className="surface-lift flex min-w-0 flex-col overflow-hidden rounded-card border border-white/15 bg-water/40 p-3">
          <div className="flex min-w-0 items-center justify-between gap-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <Zap size={14} className="shrink-0 text-brand" />
              <p className="text-[0.75rem] font-semibold leading-tight tracking-tight text-content">Electrolysis status</p>
            </div>
            <p className={cn("flex shrink-0 items-center gap-1 text-[0.625rem] font-medium", BADGE_TEXT[electrolysisBadge.tone])}>
              <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", BADGE_DOT[electrolysisBadge.tone])} />
              {electrolysisBadge.label}
            </p>
          </div>
          <div className="flex flex-1 items-center justify-center pt-2">
            <GaugeArc
              percent={watts != null && gaugeRanges.wattsMax > 0 ? (watts / gaugeRanges.wattsMax) * 100 : 0}
              hasReading={watts != null}
              value={watts ?? undefined}
              valueUnit=" W"
              decimals={1}
              label="Power"
              size={112}
              // "waiting" = this cycle's charge target is already reached and
              // the electrode is holding for the next cycle — a normal part of
              // the dosing workflow, not a fault, but a flat "0%" reads as
              // broken/stuck. Say so explicitly instead.
              placeholder={electrolysisState === "waiting" ? "Waiting\u2026" : undefined}
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
  // "Off" is a deliberate user choice, not a fault, so it gets a neutral
  // slate rather than the semantic "bad" red (which is reserved for actual
  // device/connection faults elsewhere in the app — an off toggle should
  // never look like an alarm). "High" uses the restrained accent colour
  // rather than a second shade of green, since normal/high are both "good"
  // states and high is just a stronger selection of the same one.
  const THUMB_COLOR: Record<DosingMode, string> = {
    off: "#64748b",
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


