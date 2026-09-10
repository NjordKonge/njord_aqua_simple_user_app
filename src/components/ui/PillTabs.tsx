import { cn } from "@/lib/utils";
import { playTapFeedback } from "@/lib/ui/feedback";

/**
 * Compact segmented control (time-range / mode selectors).
 *
 * The selected option is a single absolutely-positioned pale-blue pill that
 * slides between slots (translateX by index) instead of each button toggling
 * its own background — that gives the indicator a continuous identity as it
 * moves. Flat fill, no gradient or shadow; text stays legible dark navy
 * rather than switching to white, per spec ("pale blue selected background
 * and clear text").
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
        className="absolute inset-y-1 left-1 rounded-full bg-brand/12 transition-transform duration-200 ease-[var(--ease-standard)]"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${activeIndex * 100}%)`,
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
            "relative flex-1 rounded-full px-4 py-1.5 text-sm transition-colors duration-150",
            opt.value === value ? "font-semibold text-brand" : "font-medium text-muted",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

