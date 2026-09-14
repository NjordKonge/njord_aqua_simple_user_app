// OTA update progress dialog.
//
// Mounted once (in the root layout). Renders whenever an OTA session is
// active, showing the current phase, a progress bar for the transfer, and —
// on completion or failure — a dismiss / retry affordance. Ported from the
// njord-aqua-main reference implementation's OtaDialog, restyled to match
// this app's bottom-sheet visual language.

import { AlertTriangle, CheckCircle2, Loader2, RotateCw, X } from "lucide-react";
import { useOtaState, cancelOta, dismissOta, startOta } from "@/lib/ota/otaController";
import type { OtaPhase } from "@/lib/device/store";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const PHASE_LABEL: Record<OtaPhase | "idle" | "error", string> = {
  idle: "Preparing…",
  reboot: "Rebooting into updater",
  reconnect: "Reconnecting to updater",
  start: "Erasing firmware",
  transfer: "Uploading firmware",
  finish: "Finalizing",
  done: "Update complete",
  error: "Update failed",
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

export function OtaDialog() {
  const s = useOtaState();

  if (!s.active) return null;

  const running = !s.succeeded && s.phase !== "error";
  const pct = s.total > 0 ? Math.round((s.sent / s.total) * 100) : 0;
  const isTransfer = s.phase === "transfer";
  const title = PHASE_LABEL[s.phase] ?? "Updating";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      role="dialog"
      aria-modal="true"
    >
      <button
        aria-label="Close"
        className="absolute inset-0 animate-backdrop bg-[#142d3d]/45"
        onClick={() => { if (!running) dismissOta(); }}
      />
      <div
        className="surface-lift relative w-full animate-sheet space-y-4 rounded-t-card border-t border-border-soft bg-surface px-6 pb-9 pt-3"
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <div aria-hidden className="mx-auto mb-1 h-1 w-9 rounded-full bg-border" />

        <div className="flex items-center gap-3">
          {s.phase === "error" ? (
            <AlertTriangle size={20} className="shrink-0 text-bad" />
          ) : s.succeeded ? (
            <CheckCircle2 size={20} className="shrink-0 text-good" />
          ) : (
            <Loader2 size={20} className="shrink-0 animate-spin text-brand" />
          )}
          <div className="min-w-0">
            <h2 className="type-heading truncate">{title}</h2>
            <p className="type-label truncate text-faint">
              {s.deviceName}
              {s.version ? ` → firmware ${s.version}` : ""}
            </p>
          </div>
        </div>

        {s.phase === "error" ? (
          <div className="space-y-4">
            <p className="break-words text-sm font-medium text-bad">{s.error}</p>
            <p className="type-label text-faint">
              The device stays on its current firmware. It should reconnect on its own; if not,
              use reconnect from the device card.
            </p>
            <Button variant="secondary" onClick={() => dismissOta()}>
              Close
            </Button>
            {s.deviceId && (
              <Button
                onClick={() => {
                  const id = s.deviceId!;
                  const name = s.deviceName ?? undefined;
                  dismissOta();
                  void startOta(id, name);
                }}
              >
                <RotateCw size={17} /> Retry
              </Button>
            )}
          </div>
        ) : s.succeeded ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-muted">
              The device accepted the image and is rebooting into the new firmware. It will
              reconnect automatically in a few seconds.
            </p>
            <Button onClick={() => dismissOta()}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
              {isTransfer ? (
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-200 ease-out"
                  style={{ width: `${pct}%` }}
                />
              ) : (
                <div className="h-full w-1/3 animate-pulse rounded-full bg-brand/60" />
              )}
            </div>
            <div className={cn("flex items-center justify-between text-xs", "text-faint")}>
              <span className="truncate">{s.detail ?? title}</span>
              {isTransfer && (
                <span className="tnum shrink-0 pl-2">
                  {fmtBytes(s.sent)} / {fmtBytes(s.total)} ({pct}%)
                </span>
              )}
            </div>
            <p className="type-label text-faint">
              Keep the app open and stay near the device. Do not power it off during the update.
            </p>
            <Button variant="secondary" onClick={() => cancelOta()}>
              <X size={17} /> Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
