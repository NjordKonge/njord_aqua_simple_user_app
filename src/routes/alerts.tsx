import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useDevices } from "@/lib/device/store";
import { useDeviceSummary } from "@/lib/device/useDeviceSummary";
import { ALERT_REFERENCE } from "@/lib/device/alerts";
import { Header } from "@/components/layout/Header";
import { StatusRow } from "@/components/device/StatusRow";
import { InfoSheet } from "@/components/ui/InfoSheet";
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

function AlertsScreen() {
  const devices = useDevices();
  const deviceId = devices[0]?.id;
  const { device, status, waterStatus } = useDeviceSummary(deviceId);
  const [statusInfoOpen, setStatusInfoOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <Header />
      <h1 className="text-2xl font-semibold">Alerts</h1>

      <StatusRow
        tone={waterStatus.tone}
        label={waterStatus.label}
        message={waterStatus.message}
        onInfo={() => setStatusInfoOpen(true)}
      />

      <section>
        <p className="mb-2 text-sm text-muted">Active</p>
        {device && device.alarms.length > 0 ? (
          <div className="space-y-2">
            {device.alarms.map((alarm) => (
              <div key={alarm.id} className="rounded-card bg-surface p-4">
                <p className={cn("font-medium", SEVERITY_TONE_CLASS[alarm.severity] ?? "text-info")}>
                  {alarm.message}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-card bg-surface p-4">
            <p className="text-muted">No active alerts.</p>
          </div>
        )}
      </section>

      <section>
        <p className="mb-2 text-sm text-muted">Alert reference</p>
        <div className="overflow-hidden rounded-card">
          {ALERT_REFERENCE.map((alert) => (
            <button
              key={alert.code}
              onClick={() => setReferenceOpen(alert.code)}
              className="flex w-full items-center justify-between bg-surface-muted px-4 py-3.5 text-left"
            >
              <span>{alert.title}</span>
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
