import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useDevices } from "@/lib/device/store";
import { useDeviceSummary } from "@/lib/device/useDeviceSummary";
import { ALERT_REFERENCE } from "@/lib/device/alerts";
import { Header } from "@/components/layout/Header";
import { StatusRow } from "@/components/device/StatusRow";
import { InfoSheet } from "@/components/ui/InfoSheet";
import { playTapFeedback } from "@/lib/ui/feedback";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/alerts")({
  component: AlertsScreen,
});

const SEVERITY_TONE_CLASS: Record<string, string> = {
  info: "text-info",
  warning: "text-warn",
  error: "text-bad",
  critical: "text-bad",
};
/** CSS colour expression per severity, for the card's edge rule and wash. */
const SEVERITY_VAR: Record<string, string> = {
  info: "var(--color-info)",
  warning: "var(--color-warn)",
  error: "var(--color-bad)",
  critical: "var(--color-bad)",
};

function AlertsScreen() {
  const devices = useDevices();
  const deviceId = devices[0]?.id;
  const { device, status, waterStatus } = useDeviceSummary(deviceId);
  const [statusInfoOpen, setStatusInfoOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState<string | null>(null);

  return (
    <div className="stagger space-y-6">
      <Header />
      <h1 className="text-2xl font-semibold">Alerts</h1>

      <StatusRow
        tone={waterStatus.tone}
        label={waterStatus.label}
        message={waterStatus.message}
        onInfo={() => setStatusInfoOpen(true)}
      />

      <section>
        <p className="mb-2.5 text-[0.6875rem] font-medium uppercase tracking-wider text-faint">Active</p>
        {device && device.alarms.length > 0 ? (
          <div className="space-y-2">
            {device.alarms.map((alarm) => {
              const tone = SEVERITY_VAR[alarm.severity] ?? "var(--color-info)";
              return (
                <div
                  key={alarm.id}
                  className="surface-lift relative overflow-hidden rounded-card border border-border-soft bg-surface p-4 pl-[1.125rem]"
                  style={{
                    backgroundImage: `linear-gradient(100deg, color-mix(in srgb, ${tone} 11%, transparent), transparent 55%)`,
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-[3px]"
                    style={{ background: `linear-gradient(to bottom, transparent, ${tone}, transparent)` }}
                  />
                  <p className={cn("font-medium", SEVERITY_TONE_CLASS[alarm.severity] ?? "text-info")}>
                    {alarm.message}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="surface-lift flex items-center gap-2.5 rounded-card border border-border-soft bg-surface p-4">
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-good"
              style={{ boxShadow: "0 0 10px var(--color-good)" }}
            />
            <p className="text-muted">No active alerts.</p>
          </div>
        )}
      </section>

      <section>
        <p className="mb-2.5 text-[0.6875rem] font-medium uppercase tracking-wider text-faint">Alert reference</p>
        <div className="surface-lift overflow-hidden rounded-card border border-border-soft">
          {ALERT_REFERENCE.map((alert) => (
            <button
              key={alert.code}
              onClick={() => {
                playTapFeedback();
                setReferenceOpen(alert.code);
              }}
              className="press flex w-full items-center justify-between bg-surface-muted px-4 py-3.5 text-left not-last:border-b not-last:border-border-soft active:bg-surface-raised"
            >
              <span>{alert.title}</span>
              <ChevronRight size={17} className="shrink-0 text-faint" />
            </button>
          ))}
        </div>
      </section>

      <InfoSheet open={statusInfoOpen} onClose={() => setStatusInfoOpen(false)} title={status.headline}>
        <p className="text-muted">{waterStatus.message}</p>
        {status.detail ? <p className="mt-2 text-muted">{status.detail}</p> : null}
      </InfoSheet>

      {ALERT_REFERENCE.map((alert) => (
        <InfoSheet
          key={alert.code}
          open={referenceOpen === alert.code}
          onClose={() => setReferenceOpen(null)}
          title={alert.title}
        >
          <p className="text-muted">{alert.explanation}</p>
        </InfoSheet>
      ))}
    </div>
  );
}
