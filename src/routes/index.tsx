import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Settings as SettingsIcon,
  HelpCircle,
  Gauge as GaugeIcon,
  BluetoothSearching,
  AlertTriangle,
} from "lucide-react";
import { useDevices, useCommands, sendCommand } from "@/lib/device/store";
import type { CommandEntry } from "@/lib/device/types";
import { useDeviceSummary } from "@/lib/device/useDeviceSummary";
import { startTreatment, stopTreatment, clearFault, pairDevice } from "@/lib/device/actions";
import { requestTankReading } from "@/lib/device/tank";
import { setDosingMode, type DosingMode } from "@/lib/device/dosing";
import { formatRelativeAgo } from "@/lib/device/history";
import { useGaugeRanges } from "@/lib/settings/gaugeSettings";
import { playModeChangeFeedback, playConfirmFeedback, playAbortFeedback } from "@/lib/ui/feedback";
import { BUILD_TAG } from "@/lib/buildInfo";
import { Header } from "@/components/layout/Header";
import { StatusRow } from "@/components/device/StatusRow";
import { TankGraphic } from "@/components/device/TankGraphic";
import { DeviceCard } from "@/components/device/DeviceCard";
import { ElectrolysisStatusPanel } from "@/components/device/ElectrolysisStatusPanel";
import { InfoSheet } from "@/components/ui/InfoSheet";
import { Button } from "@/components/ui/Button";
import { SpeedDial } from "@/components/ui/SpeedDial";
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

  // Which error the user has closed. Stored as the error's own text rather
  // than a boolean so dismissal only ever applies to *that* error: if the
  // fault changes, or clears and later comes back, the row returns on its
  // own. A plain boolean would let one tap permanently silence every future
  // fault, which is not something a water-treatment device should allow.
  const [dismissedError, setDismissedError] = useState<string | null>(null);

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

  // Only a genuine fault is closable, and only until it changes.
  const isError = waterStatus.status === "error";
  const showStatusRow = !isError || dismissedError !== waterStatus.message;

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

{showStatusRow ? (
        <StatusRow
          tone={waterStatus.tone}
          label={waterStatus.label}
          message={waterStatus.message}
          onInfo={() => setInfoOpen(true)}
          onDismiss={isError ? () => setDismissedError(waterStatus.message) : undefined}
        />
      ) : null}

      {/* WATER CONTROL — the primary panel. Everything that is true *right
          now* lives here: the control that drives the process, the two live
          readings, and the process itself. A lighter blue than the tank card
          below so the two blue surfaces read as separate cards rather than
          one long slab. */}
      <section className="surface-lift overflow-hidden rounded-card border border-white/10 bg-water">
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <p className="type-heading text-on-fill">Water control</p>
          <button
            aria-label="More information"
            onClick={() => setModeInfoOpen(true)}
            className="press rounded-full p-1 text-on-fill/70"
          >
            <HelpCircle size={18} />
          </button>
        </div>

        {/* The mode control sits at the top of the panel, directly above the
            readings it drives — set it here, see the result immediately
            below, rather than in a separate card elsewhere on the screen. */}
        <div className="px-4 pt-3">
          <p className="mb-1.5 type-cap text-on-fill/55">Treatment setting</p>
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

        {/* Two speed dials. Both are bounded magnitudes with a meaningful
            full scale, which is exactly what a dial is for — the needle's
            position says "low/normal/high" before the number is read. Their
            ranges are installation-specific, so they're set in Settings. */}
        <div className="mt-4 flex items-start justify-center gap-6 px-4">
          <SpeedDial
            value={health?.temperature.available ? health.temperature.celsius : null}
            max={gaugeRanges.tempMaxC}
            unit="°C"
            label="Water temp"
            size={128}
          />
          <SpeedDial
            value={watts}
            max={gaugeRanges.wattsMax}
            unit="W"
            label="Power"
            size={128}
            // "waiting" = this cycle's charge target is already reached and
            // the electrode is holding for the next cycle — a normal part of
            // the dosing workflow, not a fault, but a flat "0 W" reads as
            // broken/stuck. Say so explicitly instead. (watts is 0 for every
            // other non-"on" state, so this is purely a label choice.)
            placeholder={electrolysisState === "waiting" ? "Waiting\u2026" : undefined}
          />
        </div>

        <div className="mt-4 px-4">
          {/* Status only — no electrode illustration. The words are what
              carry the meaning, so they get the size; the bubbles behind
              them are ambient texture for "current is flowing" and nothing
              more. */}
          <ElectrolysisStatusPanel
            tone={electrolysisBadge.tone}
            label={electrolysisBadge.label}
            active={electrolysisOn && device.online}
          />
        </div>

        <div className="h-4" />
      </section>

      {/* Tank gets its own full-width card with a generous fixed height —
          sharing a row with the 3 metric cards capped it to ~60% of the
          screen width and whatever height the metrics stack happened to be,
          which was never "large". A dedicated section lets it be as big as
          the screen reasonably allows. */}
      {/* Dark-blue backdrop, not the usual white card: the tank artwork
          itself is white line-art on a transparent PNG (designed to sit on
          a dark surface), so a white card made it unreadable — "white on
          white". brand-deep gives it back the contrast it needs, for both
          the outline and the water fill. */}
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

        {/* Level / volume / water used as a typographic strip rather than one
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
            label={`of ${tank.capacityLiters}L`}
            emphasis={tank.low ? "warn" : "normal"}
          />
          {/* Water used — NOT AVAILABLE: the firmware has no flow sensor, so
              there is no data source for litres consumed. Shown as an
              explicit blank rather than a fabricated number. */}
          <TankStat value={null} unit="L" label="Water used" emphasis="quiet" />
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
    // Sits on the blue live-water panel, so the trough is a translucent
    // white rather than the light-surface tokens used elsewhere.
    <div className="relative grid grid-cols-3 gap-2 rounded-card border border-white/10 bg-black/15 p-1">
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
            opt.value === mode ? SELECTED_TEXT[opt.value] : "text-on-fill/65",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}


