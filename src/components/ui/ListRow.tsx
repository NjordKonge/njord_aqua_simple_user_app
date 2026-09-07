import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Flat list row on a slightly lighter surface, per spec. Chevron when it opens a picker. */
export function ListRow({
  label,
  value,
  onClick,
  chevron = true,
  className,
}: {
  label: string;
  value?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  className?: string;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 bg-surface-muted px-4 py-3.5 text-left first:rounded-t-card last:rounded-b-card",
        className,
      )}
    >
      <span className="text-content">{label}</span>
      <span className="flex items-center gap-2 text-muted">
        {value}
        {chevron && onClick ? <ChevronRight size={18} /> : null}
      </span>
    </Comp>
  );
}
