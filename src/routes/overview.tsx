import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useDevices, useTelemetry, useSonarHistory } from "@/lib/device/store";
import { wattsFromTelemetry } from "@/lib/device/power";
import { MiniLineChart } from "@/components/ui/MiniLineChart";
import { MiniBarChart } from "@/components/ui/MiniBarChart";
import { PillTabs } from "@/components/ui/PillTabs";

export const Route = createFileRoute("/overview")({
  component: OverviewScreen,
});

type Range = "daily" | "weekly" | "monthly";
const HOURS_48_MS = 48 * 60 * 60 * 1000;

function OverviewScreen() {
  const navigate = useNavigate();
  const devices = useDevices();
  const deviceId = devices[0]?.id;
  const telemetry = useTelemetry(deviceId);
  const sonarHistory = useSonarHistory(deviceId);
  const [range, setRange] = useState<Range>("daily");

  const since = Date.now() - HOURS_48_MS;
  const recent = useMemo(() => telemetry.filter((s) => s.t >= since), [telemetry, since]);

  const tempSeries = useMemo(
    () => recent.map((s) => ({ t: s.t, v: s.temp_c })),
    [recent],
  );
  const wattSeries = useMemo(
    () => recent.map((s) => ({ t: s.t, v: wattsFromTelemetry(s) })),
    [recent],
  );
  // Tank level is only sampled on-demand (see lib/device/tank.ts) — this is
  // whatever sonar shots happened to be taken while the app was open, not a
  // true continuous 48h history. Flagged: a real 48h tank chart needs the
  // firmware to log periodic sonar samples on its own.
  const recentSonar = useMemo(
    () => sonarHistory.filter((s) => s.t >= since).map((s) => ({ t: s.t, v: s.dist_mm })),
    [sonarHistory, since],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button aria-label="Back" onClick={() => navigate({ to: "/" })} className="text-muted">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-2xl font-semibold">Overview</h1>
      </div>

      <PillTabs
        options={[
          { value: "daily", label: "Daily" },
          { value: "weekly", label: "Weekly" },
          { value: "monthly", label: "Monthly" },
        ]}
        value={range}
        onChange={setRange}
      />

      {/* Water consumption — NOT AVAILABLE: the firmware has no flow sensor,
          so there is no data source for litres-consumed-per-day. Shown as an
          explicit empty state rather than fabricated numbers; flag for
          PM/firmware-owner whether a flow meter is planned. */}
      <section>
        <p className="mb-1 text-sm text-muted">Water consumption</p>
        <p className="mb-3 text-3xl font-semibold text-muted">Not available</p>
        <MiniBarChart data={[]} unit="L" />
      </section>

      <section>
        <p className="mb-2 text-sm text-muted">Water temperature — last 48h</p>
        <MiniLineChart
          data={tempSeries}
          unit="°C"
          xStartLabel="48h ago"
          xEndLabel="now"
        />
      </section>

      <section>
        <p className="mb-2 text-sm text-muted">Tank level — last 48h</p>
        <MiniLineChart
          data={recentSonar}
          unit="mm"
          xStartLabel="48h ago"
          xEndLabel="now"
          emptyLabel="No sonar readings taken yet"
        />
      </section>

      <section>
        <p className="mb-2 text-sm text-muted">Power draw — last 48h</p>
        <MiniLineChart data={wattSeries} unit="W" xStartLabel="48h ago" xEndLabel="now" />
      </section>

      {/* Last water delivery — NOT AVAILABLE: no firmware or app concept of a
          "delivery" event exists today. */}
      <section className="rounded-card bg-surface p-4">
        <p className="text-sm text-muted">Last water delivery</p>
        <p className="text-muted">Not available</p>
      </section>
    </div>
  );
}
