import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Placeholder blocks matching the shape of the content they stand in for,
 * so a slow BLE read looks like loading rather than like missing data.
 * (The sweep itself is the `.skeleton` class in styles.css, which collapses
 * automatically under `prefers-reduced-motion`.)
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

/**
 * Empty state: a quiet icon, a one-line explanation of why there's nothing
 * here, and — where one exists — the obvious next action. Never just the
 * word "None".
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-border px-5 py-7 text-center",
        className,
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted text-faint">
        <Icon size={19} strokeWidth={1.9} />
      </span>
      <p className="mt-3 type-heading text-content">{title}</p>
      {description ? (
        <p className="mt-1 max-w-[26ch] text-sm leading-snug text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4 w-full">{action}</div> : null}
    </div>
  );
}
