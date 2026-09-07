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

/**
 * Inline water-status card: colored dot + label, a one-line message, and a
 * "?" that opens the detail sheet. Not a full-width banner — sits as a row
 * within the page, per spec.
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
  return (
    <div className="flex items-start gap-3 rounded-card bg-surface p-4">
      <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", DOT_TONE[tone])} />
      <div className="flex-1">
        <p className={cn("font-medium", TEXT_TONE[tone])}>{label}</p>
        <p className="mt-0.5 text-sm text-muted">{message}</p>
      </div>
      <button aria-label="More information" onClick={onInfo} className="text-muted">
        <HelpCircle size={20} />
      </button>
    </div>
  );
}
