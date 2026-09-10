import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger" | "text";

/**
 * Solid blue primary, outlined secondary, and a clearly-distinct outlined
 * danger — flat fills, no gradients or coloured glow. Pressing just nudges
 * scale down slightly; the shadow (already minimal) doesn't move.
 */
export function Button({
  variant = "primary",
  className,
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const variants: Record<Variant, string> = {
    primary: "bg-brand text-on-fill",
    secondary: "bg-surface text-brand border border-border",
    danger: "bg-surface text-bad border border-bad/40",
    text: "text-brand",
  };

  return (
    <button
      className={cn(
        "inline-flex min-h-12 w-full items-center justify-center rounded-card px-6 text-base font-medium",
        "transition-[transform,opacity,background-color,border-color] duration-150 ease-[var(--ease-standard)]",
        "active:scale-[0.98] active:opacity-85 disabled:opacity-40 disabled:active:scale-100",
        variant === "text" && "w-auto min-h-11 px-3",
        variants[variant],
        className,
      )}
      style={style}
      {...props}
    />
  );
}

