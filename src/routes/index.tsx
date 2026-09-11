import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Settings as SettingsIcon,
  Thermometer,
  Zap,
  Droplets,
  HelpCircle,
  Gauge as GaugeIcon,
  BluetoothSearching,
  AlertTriangle,
} from "lucide-react";
import { useDevices, useCommands, useTelemetry, sendCommand } from "@/lib/device/store";
import type { CommandEntry } from "@/lib/device/types";
import { useDeviceSummary } from "@/lib/device/useDeviceSummary";
import { startTreatment, stopTreatment, clearFault, pairDevice } from "@/lib/device/actions";
import { requestTankReading } from "@/lib/device/tank";
import { setDosingMode, type DosingMode } from "@/lib/device/dosing";
import { formatRelativeAgo } from "@/lib/device/history";
import { playModeChangeFeedback, playConfirmFeedback, playAbortFeedback } from "@/lib/ui/feedback";
import { BUILD_TAG } from "@/lib/buildInfo";
import { Header } from "@/components/layout/Header";
import { StatusRow } from "@/components/device/StatusRow";
import { TankGraphic } from "@/components/device/TankGraphic";
import { DeviceCard } from "@/components/device/DeviceCard";
import { InfoSheet } from "@/components/ui/InfoSheet";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { MetricTile } from "@/components/ui/MetricTile";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/Skeleton";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
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
    electrolysisOn, electrolysisState, actions, attention,
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

  // Recent live samples, purely to give the metric tiles a sparkline —
  // "which way is this heading" context that a bare number can't carry.
  // Read-only use of telemetry the store already collects; nothing extra is
  // requested from the device for this.
  const telemetry = useTelemetry(device?.id);
  const trends = useMemo(() => {
    const recent = telemetry.slice(-32);
    return {
      temp: recent.map((s) => s.temp_c),
      watts: recent.map((s) => (s.elec_ma * s.supply_mv) / 1_000_000),
    };
  }, [telemetry]);

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

      <StatusRow
        tone={waterStatus.tone}
        label={waterStatus.label}
        message={waterStatus.message}
        onInfo={() => setInfoOpen(true)}
      />

      {/* Tank gets its own full-width card with a generous fixed height —
          sharing a row with the 3 metric cards capped it to ~60% of the
          screen width and whatever height the metrics stack happened to be,
          which was never "large". A dedicated section lets it be as big as
          the screen reasonably allows. */}
      {/* Dark-blue backdrop, not the usual white card: the tank artwork
          itself is white line-art on a transparent PNG (designed to sit on
          a dark surface), so a white card made it unreadable — "white on
          white". brand-deep gives it back the contrast it needs, for both
          the outline and the coloured fill level. */}
      <div className="surface-lift overflow-hidden rounded-card border border-white/10 bg-brand-deep">
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <p className="truncate type-heading text-on-fill">{name}</p>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 type-label text-on-fill/85">
            <GaugeIcon size={12} strokeWidth={2.2} />
            Tank level
          </span>
        </div>

        <div className="h-64 w-full px-4 pt-2">
          <TankGraphic
            percent={tank.percent}
            liters={tank.liters}
            capacityLiters={tank.capacityLiters}
            low={tank.low}
            hasReading={tank.hasReading}
            electrolysisOn={electrolysisOn}
            showCaption={false}
          />
        </div>

        {/* Level / volume / capacity as a typographic strip rather than one
            run-on caption: the figure carries the weight, the word beneath
            it stays small and quiet, so the numbers are scannable at a
            glance and the labels never compete with them. */}
        <div className="mt-3 grid grid-cols-3 divide-x divide-white/10 border-t border-white/10">
          <TankStat
            value={tank.hasReading ? tank.percent : null}
            unit="%"
            label="Level"
            emphasis={tank.low ? "warn" : "normal"}
          />
          <TankStat
            value={tank.hasReading ? tank.liters : null}
            unit="L"
            label="Volume"
            emphasis={tank.low ? "warn" : "normal"}
          />
          <TankStat value={tank.capacityLiters} unit="L" label="Capacity" emphasis="quiet" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MetricTile
          icon={Thermometer}
          label="Water temp"
          tone="info"
          value={health?.temperature.available ? health.temperature.celsius : null}
          unit="°C"
          trend={trends.temp}
        />
        <MetricTile
          icon={Zap}
          label="Power"
          tone="warn"
          value={watts}
          unit="W"
          trend={trends.watts}
          // "waiting" = this cycle's charge target is already reached and
          // the electrode is holding for the next cycle — a normal part of
          // the dosing workflow, not a fault, but a flat "0 W" reads as
          // broken/stuck. Say so explicitly instead. (watts is 0 for every
          // other non-"on" state, so this is purely a label choice.)
          placeholderText={
            electrolysisState === "waiting" ? "Waiting\u2026" : watts === null ? "—" : undefined
          }
        />
        <MetricTile icon={Droplets} label="Water used" tone="info" value={null} placeholderText="N/A" />
      </div>

      <div>
        <SectionHeader
          title="Chlorination mode"
          action={
            <button
              aria-label="More information"
              onClick={() => setModeInfoOpen(true)}
              className="press rounded-full p-1 text-faint"
            >
              <HelpCircle size={18} />
            </button>
          }
        />
        <div className="space-y-3">
          <LiveElectrolysisStatus online={device.online} state={electrolysisState} />
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
    <div className="flex flex-col items-center px-2 py-3">
      {value === null ? (
        <span className="type-value text-on-fill/40">—</span>
      ) : (
        <AnimatedNumber
          value={value}
          decimals={0}
          unit={unit}
          className={cn(
            "type-value",
            emphasis === "warn" ? "text-warn" : emphasis === "quiet" ? "text-on-fill/55" : "text-on-fill",
          )}
          unitClassName={cn(
            "ml-0.5 type-unit",
            emphasis === "warn" ? "text-warn/80" : "text-on-fill/50",
          )}
        />
      )}
      <p className="mt-0.5 type-cap text-on-fill/50">{label}</p>
    </div>
  );
}

/**
 * Single physical-LED-style row: a traffic-light readout of the electrode's
 * real-time drive state (LiveStatus.phase / `ph`), replacing the previous
 * two-LED "Chlorination" + "Electrolysis" bar.
 *  - Green (on):      actively driving current right now.
 *  - Yellow (waiting): this cycle's charge target is already reached; the
 *    electrode is holding until the next cycle starts (or, while offline
 *    momentarily reconnecting mid-cycle, the last known driving state).
 *  - Red (off):        not running an electrolysis cycle at all — Chlorination
 *    is Off, the device is offline, or a fault stopped it.
 *
 * Only the "on" (green) state pulses — the others stay steady.
 */
function LiveElectrolysisStatus({
  online,
  state,
}: {
  online: boolean;
  state: "on" | "waiting" | "off";
}) {
  const effective = online ? state : "off";
  const badge = !online
    ? { tone: "bad" as const, label: "Offline" }
    : effective === "on"
      ? { tone: "good" as const, label: "Running" }
      : effective === "waiting"
        ? { tone: "warn" as const, label: "Done for cycle" }
        : { tone: "bad" as const, label: "Off" };

  return (
    <div className="surface-lift flex items-center justify-between gap-3 rounded-card border border-border-soft bg-surface px-3.5 py-3">
      <span className="type-cap text-faint">Live electrolysis</span>
      {/* Only a genuinely-running electrode gets the pulsing dot; the other
          states are steady, so the motion keeps meaning "right now". */}
      <StatusBadge tone={badge.tone} label={badge.label} pulse={effective === "on" && online} />
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
    <div className="surface-lift relative grid grid-cols-3 gap-2 rounded-card border border-border-soft bg-surface-muted p-1">
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-[calc(var(--radius-card)-0.25rem)] transition-all duration-200 ease-[var(--ease-standard)]"
        style={{
          width: `calc((100% - 0.5rem) / 3)`,
          transform: `translateX(${activeIndex * 100}%)`,
          backgroundColor: thumb,
        }}
      />
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "relative rounded-card px-3 py-3 text-sm font-medium transition-colors duration-150",
            "active:scale-[0.98] transition-transform",
            opt.value === mode ? SELECTED_TEXT[opt.value] : "text-muted",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}


