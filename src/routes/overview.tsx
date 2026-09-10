import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, Download, Loader2 } from "lucide-react";
import { useDevices, useTelemetry, useSonarHistory } from "@/lib/device/store";
import { useDeviceSummary } from "@/lib/device/useDeviceSummary";
import { wattsFromTelemetry, voltsFromTelemetry } from "@/lib/device/power";
import {
  useHistoryLog,
  useMergedTelemetry,
  useMergedSonar,
  RANGE_WINDOW_MS,
  RANGE_SHORT_LABEL,
  chartAxisLabels,
  type HistoryRange,
} from "@/lib/device/history";
import { MiniLineChart } from "@/components/ui/MiniLineChart";
import { MiniBarChart } from "@/components/ui/MiniBarChart";
import { PillTabs } from "@/components/ui/PillTabs";
import { CycleRing } from "@/components/device/CycleRing";

export const Route = createFileRoute("/overview")({
  component: OverviewScreen,
});

function OverviewScreen() {
  const navigate = useNavigate();
  const devices = useDevices();
  const device = devices[0];
  const deviceId = device?.id;
  const telemetry = useTelemetry(deviceId);
  const sonarHistory = useSonarHistory(deviceId);
  const { cycleRing } = useDeviceSummary(deviceId);
  const [range, setRange] = useState<HistoryRange>("daily");

  // Pulls the firmware's own flash-log history for the selected window, so
  // these charts show everything the device recorded — including while the
  // app was closed — not just this session's live rolling buffer (see
  // lib/device/history.ts for why that buffer alone isn't enough). The
  // automatic fetch is throttled, so `refresh()` is also wired to an
  // explicit "Load history" button below — belt and braces for cases where
  // the automatic fetch didn't happen to land (device only just reconnected,
  // app resumed from background rather than a true cold start, etc.).
  const {
    entries: logEntries,
    loading: historyLoading,
    downloading: historyDownloading,
    progressPct: historyProgressPct,
    refresh: refreshHistory,
  } = useHistoryLog(deviceId, Boolean(device?.online), range);

  const since = Date.now() - RANGE_WINDOW_MS[range];
  const rangeShort = RANGE_SHORT_LABEL[range];

  const mergedTelemetry = useMergedTelemetry(logEntries, telemetry, since);
  // Tank level readings are only ever taken on-demand (see lib/device/tank.ts)
  // — the firmware doesn't yet log periodic sonar samples on its own, so this
  // still reflects whatever shots happened to be taken, just merged with any
  // SON rows the flash log does have from those on-demand reads.
  const mergedSonar = useMergedSonar(logEntries, sonarHistory, since);

  const tempSeries = useMemo(
    () => mergedTelemetry.map((s) => ({ t: s.t, v: s.temp_c })),
    [mergedTelemetry],
  );
  const wattSeries = useMemo(
    () => mergedTelemetry.map((s) => ({ t: s.t, v: wattsFromTelemetry(s) })),
    [mergedTelemetry],
  );
  const voltSeries = useMemo(
    () => mergedTelemetry.map((s) => ({ t: s.t, v: voltsFromTelemetry(s) })),
    [mergedTelemetry],
  );
  const ampSeries = useMemo(
    () => mergedTelemetry.map((s) => ({ t: s.t, v: s.elec_ma })),
    [mergedTelemetry],
  );
  const recentSonar = useMemo(
    () => mergedSonar.map((s) => ({ t: s.t, v: s.dist_mm })),
    [mergedSonar],
  );

  // Axis labels are derived from whatever is ACTUALLY plotted, not the
  // nominal requested window — a chart with only 3h of real samples must
  // say "3h ago", never "24h ago" just because the Daily tab is selected.
  const tempLabels = chartAxisLabels(tempSeries);
  const tankLabels = chartAxisLabels(recentSonar);
  const voltLabels = chartAxisLabels(voltSeries);
  const ampLabels = chartAxisLabels(ampSeries);
  const wattLabels = chartAxisLabels(wattSeries);


  return (
    <div className="stagger space-y-6">
      <div className="flex items-center gap-1">
        <button
          aria-label="Back"
          onClick={() => navigate({ to: "/" })}
          className="press -ml-2 rounded-full p-1.5 text-muted"
        >
          <ChevronLeft size={23} />
        </button>
        <h1 className="type-title">Overview</h1>
      </div>

      {/* -mx-5/px-5 bleeds to the screen edge so 5 pills have room to
          overflow into a horizontal scroll on narrow phones instead of
          clipping, while looking identical to before when they all fit. */}
      <div className="-mx-5 overflow-x-auto px-5">
        <PillTabs
          options={[
            { value: "1h", label: "1h" },
            { value: "5h", label: "5h" },
            { value: "daily", label: "24h" },
            { value: "weekly", label: "7d" },
            { value: "monthly", label: "30d" },
          ]}
          value={range}
          onChange={setRange}
        />
      </div>

      <button
        onClick={refreshHistory}
        disabled={!device?.online || historyDownloading}
        className="press flex w-full items-center justify-center gap-2 rounded-card border border-border-soft bg-surface-muted py-2.5 text-sm font-medium text-muted transition-opacity disabled:opacity-60"
      >
        {historyDownloading ? (
          <>
            <Loader2 size={15} className="animate-spin" />
            {historyProgressPct !== null ? `Loading history… ${historyProgressPct}%` : "Loading history…"}
          </>
        ) : (
          <>
            <Download size={15} />
            Load history
          </>
        )}
      </button>

      <section>
        <p className="mb-2.5 type-label uppercase tracking-wider text-faint">Operation cycle</p>
        <CycleRing summary={cycleRing} />
      </section>

      {/* Water consumption — NOT AVAILABLE: the firmware has no flow sensor,
          so there is no data source for litres-consumed-per-day. Shown as an
          explicit empty state rather than fabricated numbers; flag for
          PM/firmware-owner whether a flow meter is planned. */}
      <section>
        <p className="mb-1 type-label uppercase tracking-wider text-faint">Water consumption</p>
        <p className="mb-3 type-reading text-faint">Not available</p>
        <MiniBarChart data={[]} unit="L" />
      </section>

      <section>
        <p className="mb-2.5 type-label uppercase tracking-wider text-faint">
          Water temperature — last {rangeShort}
        </p>
        <MiniLineChart
          data={tempSeries}
          unit="°C"
          xStartLabel={tempLabels.start}
          xEndLabel={tempLabels.end}
          emptyLabel={historyLoading ? "Loading device history…" : "No data yet"}
        />
      </section>

      <section>
        <p className="mb-2.5 type-label uppercase tracking-wider text-faint">
          Tank level — last {rangeShort}
        </p>
        <MiniLineChart
          data={recentSonar}
          unit="mm"
          xStartLabel={tankLabels.start}
          xEndLabel={tankLabels.end}
          emptyLabel={historyLoading ? "Loading device history…" : "No sonar readings taken yet"}
        />
      </section>

      <section>
        <p className="mb-2.5 type-label uppercase tracking-wider text-faint">
          Electrode voltage — last {rangeShort}
        </p>
        <MiniLineChart
          data={voltSeries}
          unit="V"
          xStartLabel={voltLabels.start}
          xEndLabel={voltLabels.end}
          emptyLabel={historyLoading ? "Loading device history…" : "No data yet"}
        />
      </section>

      <section>
        <p className="mb-2.5 type-label uppercase tracking-wider text-faint">
          Electrode current — last {rangeShort}
        </p>
        <MiniLineChart
          data={ampSeries}
          unit="mA"
          xStartLabel={ampLabels.start}
          xEndLabel={ampLabels.end}
          emptyLabel={historyLoading ? "Loading device history…" : "No data yet"}
        />
      </section>

      <section>
        <p className="mb-2.5 type-label uppercase tracking-wider text-faint">
          Power draw — last {rangeShort}
        </p>
        <MiniLineChart
          data={wattSeries}
          unit="W"
          xStartLabel={wattLabels.start}
          xEndLabel={wattLabels.end}
          emptyLabel={historyLoading ? "Loading device history…" : "No data yet"}
        />
      </section>

      {/* Last water delivery — NOT AVAILABLE: no firmware or app concept of a
          "delivery" event exists today. */}
      <section className="surface-lift rounded-card border border-border-soft bg-surface p-4">
        <p className="type-label uppercase tracking-wider text-faint">Last water delivery</p>
        <p className="mt-1 text-muted">Not available</p>
      </section>
    </div>
  );
}
