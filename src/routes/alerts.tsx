import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight, ShieldCheck, Info, AlertTriangle, OctagonAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useDevices } from "@/lib/device/store";
import { useDeviceSummary } from "@/lib/device/useDeviceSummary";
import { ALERT_REFERENCE } from "@/lib/device/alerts";
import { Header } from "@/components/layout/Header";
import { StatusRow } from "@/components/device/StatusRow";
import { InfoSheet } from "@/components/ui/InfoSheet";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/Skeleton";
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
/** Icon per severity, so severity is legible without relying on colour
 *  alone — colour-blind users get the same signal from the glyph. */
const SEVERITY_ICON: Record<string, LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  error: OctagonAlert,
  critical: OctagonAlert,
};
const SEVERITY_LABEL: Record<string, string> = {
  info: "Info",
  warning: "Warning",
  error: "Error",
  critical: "Critical",
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
      <h1 className="type-title">Alerts</h1>

      <StatusRow
        tone={waterStatus.tone}
        label={waterStatus.label}
        message={waterStatus.message}
        onInfo={() => setStatusInfoOpen(true)}
      />

      <section>
        <SectionHeader
          title="Active"
          action={
            device && device.alarms.length > 0 ? (
              <span className="rounded-full bg-bad/12 px-2 py-0.5 type-label text-bad">
                {device.alarms.length}
              </span>
            ) : null
          }
        />
        {device && device.alarms.length > 0 ? (
          <div className="space-y-2">
            {device.alarms.map((alarm) => {
              const tone = SEVERITY_VAR[alarm.severity] ?? "var(--color-info)";
              const Icon = SEVERITY_ICON[alarm.severity] ?? Info;
              const toneClass = SEVERITY_TONE_CLASS[alarm.severity] ?? "text-info";
              return (
                <div
                  key={alarm.id}
                  className="surface-lift relative flex gap-3 overflow-hidden rounded-card border border-border-soft bg-surface py-4 pl-[1.125rem] pr-4"
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-3 left-0 w-[3px] rounded-full"
                    style={{ backgroundColor: tone }}
                  />
                  <span
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.6rem]",
                      toneClass,
                    )}
                    style={{ backgroundColor: `color-mix(in srgb, ${tone} 12%, transparent)` }}
                  >
                    <Icon size={15} strokeWidth={2.1} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("type-cap", toneClass)}>
                      {SEVERITY_LABEL[alarm.severity] ?? "Alert"}
                    </p>
                    <p className="mt-0.5 text-sm leading-snug text-content">{alarm.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={ShieldCheck}
            title="All clear"
            description="No active alerts. You'll see anything that needs attention here."
          />
        )}
      </section>

      <section>
        <SectionHeader title="Alert reference" />
        <div className="surface-lift overflow-hidden rounded-card border border-border-soft">
          {ALERT_REFERENCE.map((alert) => (
            <button
              key={alert.code}
              onClick={() => {
                playTapFeedback();
                setReferenceOpen(alert.code);
              }}
              className="press flex w-full items-center justify-between gap-3 bg-surface-muted px-4 py-3.5 text-left not-last:border-b not-last:border-border-soft active:bg-surface-raised"
            >
              <span className="text-sm text-content">{alert.title}</span>
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
