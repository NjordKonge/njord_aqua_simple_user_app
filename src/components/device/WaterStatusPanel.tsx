import { X, HelpCircle } from "lucide-react";
import { WaterStatusCup } from "@/components/ui/WaterStatusCup";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/device/status";

/**
 * The big "Water status" readout at the top of Home, just under the device
 * connection card: a tone-coloured cup icon, a large headline, and a short
 * explanation.
 *
 * This intentionally folds two different questions into one panel:
 *   1. Is there a genuine device fault right now? (real signal, from the
 *      firmware) — if so, that always wins and is shown in red, and can be
 *      dismissed once acknowledged (see onDismiss).
 *   2. Otherwise, has treatment been running long enough to trust the
 *      water? (a placeholder timer heuristic, see
 *      lib/device/waterTreatmentTimer.ts) — green/yellow/red from that.
 * Keeping both under one "Water status" heading, rather than a separate
 * fault banner, is deliberate: a user only has one question ("can I use the
 * water right now"), and a fault is simply the most urgent possible answer
 * to it.
 */
export function WaterStatusPanel({
  tone,
  headline,
  message,
  onInfo,
  onDismiss,
}: {
  tone: Tone;
  headline: string;
  message: string;
  onInfo?: () => void;
  /** Only passed for a genuine, acknowledgeable fault. */
  onDismiss?: () => void;
}) {
  const TEXT_TONE: Record<Tone, string> = {
    good: "text-good",
    info: "text-content",
    warn: "text-warn",
    bad: "text-bad",
  };

  return (
    <div className="surface-lift relative flex items-center gap-4 overflow-hidden rounded-card border border-border-soft bg-surface p-4">
      <WaterStatusCup tone={tone} size={56} />
      <div className="min-w-0 flex-1">
        <p className="type-cap text-faint">Water status</p>
        <p className={cn("type-reading truncate", TEXT_TONE[tone])}>{headline}</p>
        <p className="mt-0.5 text-sm leading-snug text-muted">{message}</p>
      </div>
      <div className="absolute right-3 top-3 flex items-center gap-1">
        {onInfo ? (
          <button
            aria-label="More information"
            onClick={onInfo}
            className="press flex h-8 w-8 items-center justify-center rounded-full text-faint"
          >
            <HelpCircle size={18} />
          </button>
        ) : null}
        {onDismiss ? (
          <button
            aria-label="Dismiss"
            onClick={onDismiss}
            className="press flex h-8 w-8 items-center justify-center rounded-full text-faint"
          >
            <X size={18} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

