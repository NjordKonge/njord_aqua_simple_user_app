import { useEffect } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Bottom sheet used for the "?" info affordance: explains a status or alert
 * inline without navigating away, per spec.
 */
export function InfoSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <button
        aria-label="Close"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="relative w-full rounded-t-card border-t border-border bg-surface p-6 pb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="text-muted">
            <X size={22} />
          </button>
        </div>
        <div className="text-content">{children}</div>
      </div>
    </div>
  );
}
