import { Loader2 } from "lucide-react";
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
    <div className="surface-lift flex items-center gap-3 overflow-hidden rounded-card border border-border-soft bg-surface p-3">
      <div className="relative flex h-24 w-28 shrink-0 items-center justify-center">
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
            className="pointer-events-none absolute right-[1.6rem] top-1/2 h-2 w-2 -translate-y-1/2 animate-breathe rounded-full bg-[#37a6e8]"
            style={{ boxShadow: "0 0 6px 1.5px rgb(55 166 232 / 0.7)" }}
          />
        ) : null}
      </div>

      {/* Two lines, not three — name (+ freshness, right-aligned on the
          same row) then a bare dot + status word, rather than a separate
          tinted pill. Matches the reference's flatter, less chrome-heavy
          card. */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate type-heading text-content">{name}</p>
          {freshness ? <p className="shrink-0 type-label text-faint">{freshness}</p> : null}
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          {state === "connecting" ? (
            <>
              <Loader2 size={13} strokeWidth={2.2} className="shrink-0 animate-spin text-info" />
              <span className="type-label text-info">Connecting…</span>
            </>
          ) : (
            <>
              <span
                aria-hidden
                className={cn("h-2 w-2 shrink-0 rounded-full", state === "online" ? "bg-good" : "bg-bad")}
              />
              <span className={cn("type-label", state === "online" ? "text-good" : "text-bad")}>
                {state === "online" ? "Connected" : "Not connected"}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

