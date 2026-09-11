import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/device/status";

/** Tinted background + matching text, per status tone. Static lookups —
 *  Tailwind's scanner can't see class names built from template literals. */
const TONE_CLASS: Record<Tone, string> = {
  good: "bg-good/12 text-good",
  info: "bg-info/12 text-info",
  warn: "bg-warn/12 text-warn",
  bad: "bg-bad/12 text-bad",
};
const DOT_CLASS: Record<Tone, string> = {
  good: "bg-good",
  info: "bg-info",
  warn: "bg-warn",
  bad: "bg-bad",
};

/**
 * Compact "small icon + short text" state pill — "Running", "Charging",
 * "Offline". The icon and the wording always agree, so the badge is
 * readable without relying on colour alone.
 *
 * `pulse` gives the leading dot a calm heartbeat for genuinely live states
 * (currently running / connected); steady states stay still so the motion
 * keeps meaning something.
 */
export function StatusBadge({
  tone,
  label,
  icon: Icon,
  pulse,
  className,
}: {
  tone: Tone;
  label: string;
  /** Optional leading icon; when omitted a plain tone dot is used instead. */
  icon?: LucideIcon;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 type-label",
        TONE_CLASS[tone],
        className,
      )}
    >
      {Icon ? (
        <Icon size={13} strokeWidth={2.2} className="shrink-0" />
      ) : (
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            DOT_CLASS[tone],
            pulse && "animate-breathe",
          )}
        />
      )}
      {label}
    </span>
  );
}
