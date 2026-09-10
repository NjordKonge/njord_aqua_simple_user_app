import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Neutral container primitive: white surface, hairline border, ~16dp
 * padding, minimal shadow. Visual treatment comes from design tokens in
 * styles.css.
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
        "surface-lift rounded-card border border-border-soft bg-surface p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
