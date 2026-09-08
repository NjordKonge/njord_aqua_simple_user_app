import { InfoSheet } from "./InfoSheet";
import { Check } from "lucide-react";
import { playTapFeedback } from "@/lib/ui/feedback";
import { cn } from "@/lib/utils";

/** Bottom-sheet option picker for settings rows (tank model, volume, water source, ...). */
export function PickerSheet<T extends string | number>({
  open,
  onClose,
  title,
  options,
  value,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  options: Array<{ value: T; label: string }>;
  value: T | null;
  onSelect: (value: T) => void;
}) {
  return (
    <InfoSheet open={open} onClose={onClose} title={title}>
      <div className="-mx-6 -mb-2">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            onClick={() => {
              playTapFeedback();
              onSelect(opt.value);
              onClose();
            }}
            className={cn(
              "press flex w-full items-center justify-between px-6 py-3.5 text-left",
              "not-last:border-b not-last:border-border-soft active:bg-surface-raised",
              opt.value === value && "font-medium text-content",
            )}
          >
            <span>{opt.label}</span>
            {opt.value === value ? (
              <Check
                size={18}
                className="text-brand"
                style={{ filter: "drop-shadow(0 0 6px color-mix(in oklab, var(--color-brand) 60%, transparent))" }}
              />
            ) : null}
          </button>
        ))}
      </div>
    </InfoSheet>
  );
}
