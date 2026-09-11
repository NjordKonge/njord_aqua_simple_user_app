import { Bluetooth, BluetoothOff, Loader2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";

/**
 * Device identity card: the real product render alongside the unit's name
 * and live connection state.
 *
 * Showing the actual hardware (rather than a generic bluetooth glyph) is
 * what makes "is my device connected?" answerable at a glance — the user
 * recognises the box on their wall. The render is desaturated and dimmed
 * while offline so connection state is legible without reading the badge,
 * and the LED on the product itself is echoed by a soft pulsing highlight
 * when connected, so the card reflects the device's real state.
 */
export function DeviceCard({
  name,
  online,
  reconnecting,
  /** e.g. "Updated just now" — freshness cue so the reading can be trusted. */
  freshness,
}: {
  name: string;
  online: boolean;
  reconnecting?: boolean;
  freshness?: string;
}) {
  const state = reconnecting ? "connecting" : online ? "online" : "offline";

  return (
    <div className="surface-lift flex items-center gap-4 overflow-hidden rounded-card border border-border-soft bg-surface p-4">
      <div className="relative flex h-16 w-20 shrink-0 items-center justify-center">
        <img
          src="/njord-device.png"
          alt=""
          aria-hidden
          className={cn(
            "max-h-full w-full object-contain transition-all duration-500 ease-[var(--ease-out-soft)]",
            state === "online" ? "opacity-100 saturate-100" : "opacity-45 grayscale",
          )}
        />
        {/* Echoes the blue status LED on the physical unit. */}
        {state === "online" ? (
          <span
            aria-hidden
            className="pointer-events-none absolute right-[1.15rem] top-1/2 h-1.5 w-1.5 -translate-y-1/2 animate-breathe rounded-full bg-[#37a6e8]"
            style={{ boxShadow: "0 0 6px 1.5px rgb(55 166 232 / 0.7)" }}
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate type-heading text-content">{name}</p>
        <div className="mt-1.5">
          {state === "connecting" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-info/12 px-2.5 py-1 type-label text-info">
              <Loader2 size={13} strokeWidth={2.2} className="animate-spin" />
              Connecting…
            </span>
          ) : state === "online" ? (
            <StatusBadge tone="good" label="Connected" icon={Bluetooth} />
          ) : (
            <StatusBadge tone="bad" label="Not connected" icon={BluetoothOff} />
          )}
        </div>
        {freshness ? <p className="mt-1.5 type-label text-faint">{freshness}</p> : null}
      </div>
    </div>
  );
}
