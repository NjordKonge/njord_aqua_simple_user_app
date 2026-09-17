import { HelpCircle } from "lucide-react";
import { WaterStatusCup } from "@/components/ui/WaterStatusCup";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/device/status";

/**
 * The big "Water status" readout at the top of Home, just under the device
 * connection card: a tone-coloured cup icon, a large headline, and a short
 * explanation.
 *
 * This is purely the "is treatment caught up enough to trust the water"
 * question, answered from the treatment-timer heuristic (see
 * lib/device/waterTreatmentTimer.ts) — green/yellow/red, or "connect the
 * device" when there's nothing to report yet.
 *
 * A genuine device fault is a separate concern and is never repeated here:
 * it only ever appears in the "Needs attention" list further down Home
 * (sourced from device.alarms), so the same fault is never spelled out
 * twice on one screen.
 */
export function WaterStatusPanel({
  tone,
  headline,
  message,
  onInfo,
}: {
  tone: Tone;
  headline: string;
  message: string;
  onInfo?: () => void;
}) {
  const TEXT_TONE: Record<Tone, string> = {
    good: "text-good",
    info: "text-content",
    warn: "text-warn",
    bad: "text-bad",
  };

  return (
    <div className="surface-lift relative flex items-center gap-3 overflow-hidden rounded-card border border-border-soft bg-surface p-3">
      <WaterStatusCup tone={tone} size={34} />
      <div className="min-w-0 flex-1 pr-8">
        <p className="type-cap text-faint">Water status</p>
        <p className={cn("truncate text-xl font-semibold leading-tight tracking-tight", TEXT_TONE[tone])}>{headline}</p>
        <p className="mt-0.5 truncate text-sm leading-snug text-muted">{message}</p>
      </div>
      {onInfo ? (
        <button
          aria-label="More information"
          onClick={onInfo}
          className="press absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-faint"
        >
          <HelpCircle size={16} />
        </button>
      ) : null}
    </div>
  );
}

