// Firmware version picker.
//
// Mounted once (in the root layout). Lists every firmware release from the
// catalog (index.json) and lets the user flash any one of them over BLE —
// newer OR older, so the device can be rolled back to a known-good build.
// Ported from the njord-aqua-main reference implementation's
// FirmwareVersionDialog, restyled to match this app's bottom-sheet visual
// language.

import { AlertTriangle, ArrowDown, ArrowUp, Check, Download, Loader2, X } from "lucide-react";
import { useState } from "react";
import {
  useFirmwareCatalog,
  isReleaseCompatible,
  compareSemver,
  type FirmwareRelease,
} from "@/lib/ota/updateCheck";
import { useFirmwarePicker, closeFirmwarePicker } from "@/lib/ota/firmwarePicker";
import { startOta, useOtaState } from "@/lib/ota/otaController";
import { cn } from "@/lib/utils";

export function FirmwareVersionDialog() {
  const target = useFirmwarePicker();
  const catalog = useFirmwareCatalog();
  const ota = useOtaState();
  const [confirming, setConfirming] = useState<FirmwareRelease | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  if (!target) return null;

  const otaActive = ota.active;

  const install = (r: FirmwareRelease) => {
    if (otaActive) return;
    setStartError(null);
    const name = target.name;
    const id = target.id;
    const online = target.online;
    closeFirmwarePicker();
    void startOta(id, name, { release: r, recover: !online }).catch((err) =>
      setStartError(err instanceof Error ? err.message : String(err)),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      <button
        aria-label="Close"
        className="absolute inset-0 animate-backdrop bg-[#142d3d]/45"
        onClick={() => { setConfirming(null); closeFirmwarePicker(); }}
      />
      <div
        className="surface-lift relative flex max-h-[85vh] w-full animate-sheet flex-col space-y-3 rounded-t-card border-t border-border-soft bg-surface px-6 pb-9 pt-3"
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <div aria-hidden className="mx-auto mb-1 h-1 w-9 rounded-full bg-border" />

        <div className="flex items-center gap-3">
          <Download size={20} className="shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <h2 className="type-heading truncate">Firmware version</h2>
            <p className="type-label truncate text-faint">
              {target.name} · currently v{target.api}
              {!target.online && " · offline"}
            </p>
          </div>
        </div>

        {startError ? <p className="type-label text-bad">{startError}</p> : null}

        <div className="-mx-1 space-y-2 overflow-y-auto px-1 pb-1">
          {!catalog ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" /> Loading catalog…
            </div>
          ) : catalog.releases.length === 0 ? (
            <p className="py-6 text-sm text-muted">No firmware releases are published.</p>
          ) : (
            catalog.releases.map((r) => {
              const compat = isReleaseCompatible(target, r);
              const cmp = compareSemver(r.version, target.api);
              const isCurrent = cmp === 0;
              const isDowngrade = cmp < 0;
              const isLatest = r.version === catalog.latest;
              const disabled = otaActive || !compat;
              const verb = isDowngrade ? "Roll back" : isCurrent ? "Re-flash" : "Install";
              return (
                <div
                  key={r.version}
                  className={cn(
                    "rounded-inner border p-3",
                    isCurrent ? "border-brand/40 bg-brand/5" : "border-border-soft bg-surface-muted",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="tnum text-sm font-semibold text-content">v{r.version}</span>
                    {isLatest && (
                      <span className="rounded-full border border-good/40 bg-good/10 px-1.5 py-0.5 text-[10px] font-medium text-good">
                        latest
                      </span>
                    )}
                    {isCurrent && (
                      <span className="flex items-center gap-0.5 rounded-full border border-brand/40 bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                        <Check size={10} /> installed
                      </span>
                    )}
                    {isDowngrade && (
                      <span className="flex items-center gap-0.5 rounded-full border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-warn">
                        <ArrowDown size={10} /> older
                      </span>
                    )}
                    {!isCurrent && !isDowngrade && (
                      <span className="flex items-center gap-0.5 rounded-full border border-brand/40 bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                        <ArrowUp size={10} /> newer
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setConfirming(r)}
                      disabled={disabled}
                      title={!compat ? "incompatible with this device's hardware/API" : `install firmware ${r.version}`}
                      className={cn(
                        "press ml-auto flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                        "disabled:opacity-40",
                        isDowngrade ? "border-warn/50 text-warn" : "border-brand/50 text-brand",
                      )}
                    >
                      {otaActive ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                      {verb}
                    </button>
                  </div>
                  {(r.released || r.notes) && (
                    <p className="mt-1 type-label text-faint">
                      {r.released ? <span className="tnum">{r.released}</span> : null}
                      {r.released && r.notes ? " · " : null}
                      {r.notes}
                    </p>
                  )}
                  {!compat && (
                    <p className="mt-1 flex items-center gap-1 type-label text-bad">
                      <AlertTriangle size={11} className="shrink-0" />
                      requires hw ≥ {r.min_hw ?? "?"} / api ≥ {r.min_api ?? "?"}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        <p className="type-label text-faint">
          {otaActive
            ? "An update is already in progress."
            : "Rolling back to an older build lets you recover from a bad update."}
        </p>
      </div>

      {confirming ? (
        <ConfirmInstallSheet
          release={confirming}
          deviceName={target.name}
          online={target.online}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const r = confirming;
            setConfirming(null);
            install(r);
          }}
        />
      ) : null}
    </div>
  );
}

function ConfirmInstallSheet({
  release,
  deviceName,
  online,
  onCancel,
  onConfirm,
}: {
  release: FirmwareRelease;
  deviceName: string;
  online: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end">
      <button aria-label="Close" className="absolute inset-0 animate-backdrop bg-[#142d3d]/45" onClick={onCancel} />
      <div
        className="surface-lift relative w-full animate-sheet space-y-4 rounded-t-card border-t border-border-soft bg-surface px-6 pb-9 pt-3"
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <div aria-hidden className="mx-auto mb-1 h-1 w-9 rounded-full bg-border" />
        <h2 className="type-heading">Install firmware {release.version}?</h2>
        <p className="text-sm leading-relaxed text-muted">
          {online
            ? `${deviceName} will reboot into its updater and stream the image over Bluetooth. Keep the app open and stay nearby.`
            : `${deviceName} appears offline — the app will look for it in update mode and stream the image. Use this to recover a device stuck mid-update. Keep the app open and stay nearby.`}
        </p>
        <button
          type="button"
          className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-card bg-brand px-6 text-base font-medium text-on-fill"
          onClick={onConfirm}
        >
          Start update
        </button>
        <button
          type="button"
          className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-card border border-border bg-surface px-6 text-base font-medium text-brand"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
