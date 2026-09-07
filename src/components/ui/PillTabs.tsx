import { cn } from "@/lib/utils";

/** Pill-shaped segmented control (Daily / Weekly / Monthly per spec). */
export function PillTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full bg-surface-muted p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            opt.value === value ? "bg-brand text-bg" : "text-muted",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
