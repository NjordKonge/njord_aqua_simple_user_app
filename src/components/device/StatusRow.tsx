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
 * A plain white card with a hairline left rule in the status tone and a
 * flat coloured dot — no wash, no glow. Keeping the treatment quiet here
 * matters: this row communicates *connection/activity*, which must stay
 * visually distinct from an actual verified-safe water reading (spec
 * requirement), so it should never look more emphatic than the tone alone
 * warrants.
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
    <div className="surface-lift relative flex items-start gap-3 overflow-hidden rounded-card border border-border-soft bg-surface p-4 pl-[1.125rem]">
      <span
        aria-hidden
        className="absolute inset-y-3 left-0 w-[3px] rounded-full"
        style={{ backgroundColor: toneColor }}
      />
      <span className={cn("relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", DOT_TONE[tone])} />
      <div className="flex-1">
        <p className={cn("type-heading", TEXT_TONE[tone])}>{label}</p>
        <p className="mt-0.5 text-sm leading-snug text-muted">{message}</p>
      </div>
      <button
        aria-label="More information"
        onClick={onInfo}
        className="press -mr-1 -mt-1 flex h-9 w-9 items-center justify-center rounded-full text-faint"
      >
        <HelpCircle size={19} />
      </button>
    </div>
  );
}

