import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const variants: Record<Variant, string> = {
    primary: "bg-brand text-bg",
    secondary: "bg-surface-muted text-content border border-border",
    danger: "bg-bad text-bg",
  };

  return (
    <button
      className={cn(
        "inline-flex min-h-14 w-full items-center justify-center rounded-card px-6 text-lg font-medium",
        "transition-opacity active:opacity-80 disabled:opacity-40",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
