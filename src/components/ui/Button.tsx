import type { ButtonHTMLAttributes } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger" | "text";

/**
 * Solid blue primary, outlined secondary, and a clearly-distinct outlined
 * danger — flat fills, no gradients or coloured glow. Pressing just nudges
 * scale down slightly; the shadow (already minimal) doesn't move.
 *
 * `loading` and `success` give an action a visible outcome rather than
 * leaving the user guessing whether a tap registered — important here
 * because every action is a BLE round-trip with real latency. Both states
 * swap the label rather than appending to it, so the button's width stays
 * stable and the layout never jumps mid-action.
 */
export function Button({
  variant = "primary",
  className,
  style,
  loading,
  success,
  loadingLabel = "Working…",
  successLabel = "Done",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  /** Brief post-action confirmation; the caller clears it on a timer. */
  success?: boolean;
  loadingLabel?: string;
  successLabel?: string;
}) {
  const variants: Record<Variant, string> = {
    primary: "bg-brand text-on-fill",
    secondary: "bg-surface text-brand border border-border",
    danger: "bg-surface text-bad border border-bad/40",
    text: "text-brand",
  };

  return (
    <button
      className={cn(
        "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-card px-6 text-base font-medium",
        "transition-[transform,opacity,background-color,border-color] duration-150 ease-[var(--ease-standard)]",
        "active:scale-[0.98] active:opacity-85 disabled:opacity-40 disabled:active:scale-100",
        variant === "text" && "w-auto min-h-11 px-3",
        success && variant === "primary" && "bg-good",
        variants[variant],
        className,
      )}
      style={style}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 size={17} className="animate-spin" />
          {loadingLabel}
        </>
      ) : success ? (
        <>
          <Check size={17} strokeWidth={2.4} className="animate-pop" />
          {successLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

