import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/device/status";

const DOT_TONE: Record<Tone, string> = {
  good: "bg-good",
  info: "bg-info",
  warn: "bg-warn",
  bad: "bg-bad",
};
const TEXT_TONE: Record<Tone, string> = {
  good: "text-good",
  info: "text-info",
  warn: "text-warn",
  bad: "text-bad",
};
/** CSS colour expression per tone, for the glow/tint (can't be a Tailwind
 *  class — these feed gradients and box-shadows). */
const TONE_VAR: Record<Tone, string> = {
  good: "var(--color-good)",
  info: "var(--color-info)",
  warn: "var(--color-warn)",
  bad: "var(--color-bad)",
};

/**
 * Inline water-status card: colored dot + label, a one-line message, and a
 * "?" that opens the detail sheet. Not a full-width banner — sits as a row
 * within the page, per spec.
 *
 * This is the first thing the eye lands on, so it carries the most treatment:
 * a soft wash of the status tone bleeding in from the left edge, a hairline
 * left rule in that tone, and a dot that emits light rather than just being
 * coloured. The tint is very low-alpha on purpose — enough that the card's
 * mood changes with the water status, not so much that it becomes a warning
 * banner for the "all good" case.
 */
export function StatusRow({
  tone,
  label,
  message,
  onInfo,
}: {
  tone: Tone;
  label: string;
  message: string;
  onInfo: () => void;
}) {
  const toneColor = TONE_VAR[tone];
  return (
    <div
      className="surface-lift relative flex items-start gap-3 overflow-hidden rounded-card border border-border-soft bg-surface p-4 pl-[1.125rem]"
      style={{
        backgroundImage: `linear-gradient(100deg, color-mix(in srgb, ${toneColor} 11%, transparent), transparent 55%)`,
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{
          background: `linear-gradient(to bottom, transparent, ${toneColor}, transparent)`,
        }}
      />
      <span
        className={cn("relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", DOT_TONE[tone])}
        style={{ boxShadow: `0 0 0 3px color-mix(in srgb, ${toneColor} 16%, transparent), 0 0 12px ${toneColor}` }}
      />
      <div className="flex-1">
        <p className={cn("font-semibold", TEXT_TONE[tone])}>{label}</p>
        <p className="mt-0.5 text-sm leading-snug text-muted">{message}</p>
      </div>
      <button
        aria-label="More information"
        onClick={onInfo}
        className="press -mr-1 -mt-1 rounded-full p-1 text-faint"
      >
        <HelpCircle size={19} />
      </button>
    </div>
  );
}

