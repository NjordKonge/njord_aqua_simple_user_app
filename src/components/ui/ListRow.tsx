import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { playTapFeedback } from "@/lib/ui/feedback";

/** Flat list row on a slightly lighter surface, per spec. Chevron when it opens a picker. */
export function ListRow({
  label,
  value,
  onClick,
  chevron = true,
  disabled = false,
  className,
}: {
  label: string;
  value?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const clickable = Boolean(onClick) && !disabled;
  const Comp = clickable ? "button" : "div";
  return (
    <Comp
      onClick={
        clickable
          ? () => {
              playTapFeedback();
              onClick?.();
            }
          : undefined
      }
      className={cn(
        "flex min-h-14 w-full items-center justify-between gap-3 bg-surface-muted px-4 py-3 text-left",
        "not-last:border-b not-last:border-border-soft first:rounded-t-card last:rounded-b-card",
        clickable && "press active:bg-surface-raised",
        disabled && "opacity-50",
        className,
      )}
    >
      <span className="text-content">{label}</span>
      <span className="flex items-center gap-2 text-muted">
        {value}
        {chevron && clickable ? (
          <ChevronRight size={18} className="text-faint" />
        ) : null}
      </span>
    </Comp>
  );
}

