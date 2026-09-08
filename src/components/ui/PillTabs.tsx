import { cn } from "@/lib/utils";
import { playTapFeedback } from "@/lib/ui/feedback";

/**
 * Pill-shaped segmented control (Daily / Weekly / Monthly per spec).
 *
 * The selected pill is a single absolutely-positioned element that slides
 * between slots (translateX by index) instead of each button toggling its
 * own background. That gives the thumb a continuous identity as it moves —
 * the detail that makes iOS/Android segmented controls feel physical — and
 * it's why the track needs equal-width slots.
 */
export function PillTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));

  return (
    <div className="relative inline-flex rounded-full border border-border-soft bg-surface-muted p-1">
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-full transition-transform duration-300 ease-[var(--ease-out-soft)]"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${activeIndex * 100}%)`,
          backgroundImage:
            "linear-gradient(to bottom, color-mix(in srgb, var(--color-brand) 90%, white), var(--color-brand))",
          boxShadow:
            "0 1px 0 rgb(255 255 255 / 0.2) inset, 0 4px 12px -6px color-mix(in srgb, var(--color-brand) 90%, transparent)",
        }}
      />
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => {
            playTapFeedback();
            onChange(opt.value);
          }}
          className={cn(
            "relative flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-200",
            opt.value === value ? "text-bg" : "text-muted",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

