import { useEffect, useRef, useState } from "react";
import { Download, HardDriveDownload, Loader2, Trash2, UploadCloud } from "lucide-react";
import type { Device } from "@/lib/device/types";
import { OtaCancelled, runOtaUpdate, type OtaState } from "@/lib/device/ota";
import {
  deleteFirmwareEntry,
  importFirmware,
  listFirmwareEntries,
  loadFirmwareBytes,
  type FirmwareEntry,
} from "@/lib/device/firmwareLibrary";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const PHASE_LABEL: Record<OtaState["phase"], string> = {
  idle: "",
  rebooting: "Rebooting device into firmware-update mode…",
  scanning: "Waiting for the device to reappear…",
  connecting: "Connecting…",
  erasing: "Erasing existing firmware…",
  streaming: "Sending firmware…",
  finishing: "Finishing update…",
  reconnecting: "Update sent — waiting for the device to restart…",
  success: "Firmware update complete.",
  "power-cycle-hint": "Sent, but unconfirmed — power-cycle the device.",
  error: "Firmware update failed.",
};

const TERMINAL_PHASES: OtaState["phase"][] = ["success", "power-cycle-hint", "error"];

/**
 * "Firmware update" section for Settings: a local backup library of `.bin`
 * images (imported once, kept on-device so re-flashing never needs a fresh
 * file pick or a network connection) plus the actual BLE OTA push, per
 * ota_app_integration_patch.md. Deliberately has no remote catalog — the
 * user supplies files directly, so there's no token or hosting to manage.
 */
export function FirmwareUpdatePanel({ device }: { device: Device | undefined }) {
  const [entries, setEntries] = useState<FirmwareEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingInstall, setPendingInstall] = useState<FirmwareEntry | null>(null);
  const [otaState, setOtaState] = useState<OtaState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    listFirmwareEntries()
      .then(setEntries)
      .catch((e) => console.warn("[firmware] list failed", e));
  };
  useEffect(refresh, []);

  const busy = otaState != null && !TERMINAL_PHASES.includes(otaState.phase);

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    setImporting(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const label = file.name.replace(/\.bin$/i, "");
      await importFirmware(bytes, label);
      refresh();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  async function runInstall(entry: FirmwareEntry) {
    if (!device?.id) return;
    setPendingInstall(null);
    const ac = new AbortController();
    abortRef.current = ac;
    setOtaState({ phase: "rebooting", attempt: 0, progress: 0, message: PHASE_LABEL.rebooting });
    try {
      const bytes = await loadFirmwareBytes(entry.id);
      await runOtaUpdate(device.id, bytes, setOtaState, ac.signal);
    } catch (err) {
      if (!(err instanceof OtaCancelled)) {
        console.warn("[firmware] OTA failed", err);
      }
    } finally {
      abortRef.current = null;
    }
  }

  return (
    <section className="surface-lift space-y-3 rounded-card border border-border-soft bg-surface p-4">
      <p className="type-cap text-faint">Firmware update</p>
      <p className="text-xs leading-relaxed text-muted">
        Push new firmware to the device over Bluetooth. Imported files are kept as a local backup
        on this phone, so you can re-install any of them later without needing the original file
        or a network connection.
      </p>

      {device?.info && device.info.fw !== "—" ? (
        <p className="text-sm text-muted">
          Device is running{" "}
          <span className="tnum font-medium text-content">fw {device.info.fw}</span>
          {" · "}
          <span className="tnum font-medium text-content">api {device.info.api}</span>
        </p>
      ) : null}
      {!device?.online ? (
        <p className="type-label text-faint">Connect to the device to install firmware.</p>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept=".bin"
        className="hidden"
        onChange={(e) => void handleFileChosen(e)}
      />
      <Button
        variant="secondary"
        loading={importing}
        loadingLabel="Importing…"
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadCloud size={17} /> Import firmware file (.bin)
      </Button>
      {importError ? <p className="type-label text-bad">{importError}</p> : null}

      {entries.length > 0 ? (
        <ul className="divide-y divide-border-soft overflow-hidden rounded-inner border border-border-soft">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 bg-surface-muted p-3">
              <HardDriveDownload size={18} className="shrink-0 text-faint" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-content">{entry.label}</p>
                <p className="type-label text-faint">
                  {formatBytes(entry.size)} · {formatDate(entry.importedAt)} · {entry.crc32}
                </p>
              </div>
              <button
                type="button"
                className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-faint"
                aria-label={`Install ${entry.label}`}
                disabled={!device?.online || busy}
                onClick={() => setPendingInstall(entry)}
              >
                <Download size={18} />
              </button>
              <button
                type="button"
                className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-faint"
                aria-label={`Delete ${entry.label}`}
                disabled={busy}
                onClick={() => void deleteFirmwareEntry(entry.id).then(refresh)}
              >
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-label text-faint">No firmware files saved yet.</p>
      )}

      {pendingInstall ? (
        <ConfirmInstallSheet
          entry={pendingInstall}
          deviceName={device?.name ?? "the device"}
          onCancel={() => setPendingInstall(null)}
          onConfirm={() => void runInstall(pendingInstall)}
        />
      ) : null}

      {otaState ? (
        <OtaProgressSheet
          state={otaState}
          onCancel={() => abortRef.current?.abort()}
          onDismiss={() => setOtaState(null)}
        />
      ) : null}
    </section>
  );
}

function ConfirmInstallSheet({
  entry,
  deviceName,
  onCancel,
  onConfirm,
}: {
  entry: FirmwareEntry;
  deviceName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <button aria-label="Close" className="absolute inset-0 animate-backdrop bg-[#142d3d]/45" onClick={onCancel} />
      <div
        className="surface-lift relative w-full animate-sheet space-y-4 rounded-t-card border-t border-border-soft bg-surface px-6 pb-9 pt-3"
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <div aria-hidden className="mx-auto mb-1 h-1 w-9 rounded-full bg-border" />
        <h2 className="type-heading">Install "{entry.label}"?</h2>
        <p className="text-sm leading-relaxed text-muted">
          {deviceName} will reboot into firmware-update mode and disconnect. Keep the device
          powered and in range for the whole transfer — it takes under a minute, and the device
          re-erases and retries automatically if the link drops.
        </p>
        <Button onClick={onConfirm}>Start update</Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function OtaProgressSheet({
  state,
  onCancel,
  onDismiss,
}: {
  state: OtaState;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const terminal = TERMINAL_PHASES.includes(state.phase);
  const tone = state.phase === "success" ? "text-good" : state.phase === "error" ? "text-bad" : state.phase === "power-cycle-hint" ? "text-warn" : "text-content";

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 animate-backdrop bg-[#142d3d]/45" />
      <div
        className="surface-lift relative w-full animate-sheet space-y-4 rounded-t-card border-t border-border-soft bg-surface px-6 pb-9 pt-3"
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <div aria-hidden className="mx-auto mb-1 h-1 w-9 rounded-full bg-border" />
        <h2 className="type-heading">Firmware update</h2>

        <div className="flex items-center gap-3">
          {!terminal ? <Loader2 size={20} className="shrink-0 animate-spin text-brand" /> : null}
          <p className={cn("text-sm leading-relaxed", tone)}>{state.message || PHASE_LABEL[state.phase]}</p>
        </div>

        {state.phase === "streaming" ? (
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-200 ease-out"
              style={{ width: `${Math.round(state.progress * 100)}%` }}
            />
          </div>
        ) : null}

        {state.error && state.phase === "error" ? (
          <p className="type-label text-faint">{state.error}</p>
        ) : null}

        {terminal ? (
          <Button onClick={onDismiss}>Done</Button>
        ) : (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
