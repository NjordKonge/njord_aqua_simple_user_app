import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger";

/**
 * Filled variants use a subtle top-to-bottom gradient plus a coloured cast
 * shadow in their own hue, so a primary button looks like a lit physical key
 * rather than a flat rectangle of brand colour. Pressing scales it down
 * slightly and collapses the shadow, which reads as the key travelling.
 */
export function Button({
  variant = "primary",
  className,
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const variants: Record<Variant, string> = {
    primary: "text-bg",
    secondary: "bg-surface-muted text-content border border-border",
    danger: "text-bg",
  };

  const filledStyle: Partial<Record<Variant, React.CSSProperties>> = {
    primary: {
      backgroundImage:
        "linear-gradient(to bottom, color-mix(in srgb, var(--color-brand) 88%, white), var(--color-brand))",
      boxShadow:
        "0 1px 0 rgb(255 255 255 / 0.18) inset, 0 8px 20px -10px color-mix(in srgb, var(--color-brand) 80%, transparent)",
    },
    danger: {
      backgroundImage:
        "linear-gradient(to bottom, color-mix(in srgb, var(--color-bad) 88%, white), var(--color-bad))",
      boxShadow:
        "0 1px 0 rgb(255 255 255 / 0.18) inset, 0 8px 20px -10px color-mix(in srgb, var(--color-bad) 80%, transparent)",
    },
  };

  return (
    <button
      className={cn(
        "inline-flex min-h-14 w-full items-center justify-center rounded-card px-6 text-[1.0625rem] font-semibold tracking-tight",
        "transition-[transform,opacity,box-shadow] duration-150 ease-[var(--ease-out-soft)]",
        "active:scale-[0.975] active:opacity-90 disabled:opacity-40 disabled:active:scale-100",
        variants[variant],
        className,
      )}
      style={{ ...filledStyle[variant], ...style }}
      {...props}
    />
  );
}

