import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Consistent section label + optional trailing action, so every screen
 * introduces a block of content the same way instead of each one inventing
 * its own heading treatment.
 */
export function SectionHeader({
  title,
  action,
  className,
}: {
  title: string;
  /** Trailing control — an info "?" button, a "See all" link, etc. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-2.5 flex items-center justify-between gap-3", className)}>
      <h2 className="type-cap text-faint">{title}</h2>
      {action}
    </div>
  );
}
