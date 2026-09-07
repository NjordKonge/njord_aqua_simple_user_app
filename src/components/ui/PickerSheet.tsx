import { InfoSheet } from "./InfoSheet";
import { Check } from "lucide-react";

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
      <div className="-mx-6 -mb-2 divide-y divide-border">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            onClick={() => {
              onSelect(opt.value);
              onClose();
            }}
            className="flex w-full items-center justify-between px-6 py-3.5 text-left"
          >
            <span>{opt.label}</span>
            {opt.value === value ? <Check size={18} className="text-brand" /> : null}
          </button>
        ))}
      </div>
    </InfoSheet>
  );
}
