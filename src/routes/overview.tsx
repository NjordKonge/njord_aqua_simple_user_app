import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useDevices, useTelemetry, useSonarHistory } from "@/lib/device/store";
import { useDeviceSummary } from "@/lib/device/useDeviceSummary";
import { wattsFromTelemetry, voltsFromTelemetry } from "@/lib/device/power";
import {
  useHistoryLog,
  useMergedTelemetry,
  useMergedSonar,
  RANGE_WINDOW_MS,
  RANGE_SHORT_LABEL,
  chartAxisTicks,
  formatRelativeAgo,
  type HistoryRange,
} from "@/lib/device/history";
import { MiniLineChart } from "@/components/ui/MiniLineChart";
import { MiniBarChart } from "@/components/ui/MiniBarChart";
import { PillTabs } from "@/components/ui/PillTabs";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { CycleRing } from "@/components/device/CycleRing";
import { cn } from "@/lib/utils";

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
  // lib/device/history.ts for why that buffer alone isn't enough). Downloads
  // ONLY ever happen when the user taps "Load history" below — never
  // automatically on mount or when switching range tabs.
  const {
    entries: logEntries,
    downloading: historyDownloading,
    progressPct: historyProgressPct,
    result: historyResult,
    dismissResult: dismissHistoryResult,
    latestEntryAt,
    refresh: refreshHistory,
  } = useHistoryLog(deviceId, Boolean(device?.online), range);
  const historyLoading = logEntries.length === 0 && historyDownloading;

  // Auto-dismiss the success/error banner after a few seconds so it doesn't
  // linger indefinitely once the user has seen it.
  useEffect(() => {
    if (!historyResult) return;
    const t = setTimeout(() => dismissHistoryResult(), 4000);
    return () => clearTimeout(t);
  }, [historyResult, dismissHistoryResult]);

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

  // Axis ticks are derived from whatever is ACTUALLY plotted, not the
  // nominal requested window — a chart with only 3h of real samples must
  // say "3h ago", never "24h ago" just because the Daily tab is selected.
  // Evenly time-spaced (not evenly sample-spaced), matching the chart's
  // linear time axis.
  const tempTicks = chartAxisTicks(tempSeries);
  const tankTicks = chartAxisTicks(recentSonar);
  const voltTicks = chartAxisTicks(voltSeries);
  const ampTicks = chartAxisTicks(ampSeries);
  const wattTicks = chartAxisTicks(wattSeries);


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

      <div className="space-y-2">
        <p className="text-center type-label text-faint">
          {latestEntryAt !== null
            ? `Latest downloaded data: ${formatRelativeAgo(latestEntryAt)}`
            : "No history downloaded yet"}
        </p>

        <button
          onClick={refreshHistory}
          disabled={!device?.online || historyDownloading}
          className="press relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-card border border-border-soft bg-surface-muted py-2.5 text-sm font-medium text-muted transition-opacity disabled:opacity-60"
        >
          {/* Progress reads as a filling bar behind the label rather than a
              separate widget — the control itself shows how far along it is. */}
          {historyDownloading && historyProgressPct !== null ? (
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-brand/12 transition-[width] duration-300 ease-[var(--ease-out-soft)]"
              style={{ width: `${historyProgressPct}%` }}
            />
          ) : null}
          <span className="relative flex items-center gap-2">
            {historyDownloading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                {historyProgressPct !== null
                  ? `Loading history… ${historyProgressPct}%`
                  : "Loading history…"}
              </>
            ) : (
              <>
                <Download size={15} />
                Load history
              </>
            )}
          </span>
        </button>

        {historyResult && (
          <div
            className={cn(
              "flex animate-pop items-center gap-2 rounded-card px-3 py-2 text-sm",
              historyResult.status === "success" ? "bg-good/12 text-good" : "bg-bad/12 text-bad",
            )}
          >
            {historyResult.status === "success" ? (
              <CheckCircle2 size={15} />
            ) : (
              <AlertCircle size={15} />
            )}
            {historyResult.message}
          </div>
        )}
      </div>

      <section>
        <SectionHeader title="Operation cycle" />
        <CycleRing summary={cycleRing} />
      </section>

      {/* Water consumption — NOT AVAILABLE: the firmware has no flow sensor,
          so there is no data source for litres-consumed-per-day. Shown as an
          explicit empty state rather than fabricated numbers; flag for
          PM/firmware-owner whether a flow meter is planned. */}
      <section>
        <SectionHeader title="Water consumption" />
        <p className="mb-3 text-sm text-muted">Not available — no flow sensor fitted</p>
        <MiniBarChart data={[]} unit="L" />
      </section>

      <ChartSection title={`Water temperature — last ${rangeShort}`} loading={historyLoading}>
        <MiniLineChart
          data={tempSeries}
          unit="°C"
          xTicks={tempTicks}
          emptyLabel="No data yet"
        />
      </ChartSection>

      <ChartSection title={`Tank level — last ${rangeShort}`} loading={historyLoading}>
        <MiniLineChart
          data={recentSonar}
          unit="mm"
          xTicks={tankTicks}
          emptyLabel="No sonar readings taken yet"
        />
      </ChartSection>

      <ChartSection title={`Electrode voltage — last ${rangeShort}`} loading={historyLoading}>
        <MiniLineChart data={voltSeries} unit="V" xTicks={voltTicks} emptyLabel="No data yet" />
      </ChartSection>

      <ChartSection title={`Electrode current — last ${rangeShort}`} loading={historyLoading}>
        <MiniLineChart data={ampSeries} unit="mA" xTicks={ampTicks} emptyLabel="No data yet" />
      </ChartSection>

      <ChartSection title={`Power draw — last ${rangeShort}`} loading={historyLoading}>
        <MiniLineChart data={wattSeries} unit="W" xTicks={wattTicks} emptyLabel="No data yet" />
      </ChartSection>

      {/* Last water delivery — NOT AVAILABLE: no firmware or app concept of a
          "delivery" event exists today. */}
      <section className="surface-lift rounded-card border border-border-soft bg-surface p-4">
        <p className="type-cap text-faint">Last water delivery</p>
        <p className="mt-1.5 text-sm text-muted">Not available</p>
      </section>
    </div>
  );
}

/**
 * A titled chart block. While the first history download is still in flight
 * there is genuinely nothing to plot, so a skeleton shaped like the chart
 * stands in — that reads as "loading" rather than as "this device has no
 * data", which an empty axis does.
 */
function ChartSection({
  title,
  loading,
  children,
}: {
  title: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <SectionHeader title={title} />
      {loading ? <Skeleton className="h-[140px] w-full rounded-card" /> : children}
    </section>
  );
}
