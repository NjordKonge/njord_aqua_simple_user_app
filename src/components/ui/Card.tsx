import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Neutral container primitive. Visual treatment comes from design tokens in
 * styles.css, so this stays unopinionated until the design step.
 */
export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-surface p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
