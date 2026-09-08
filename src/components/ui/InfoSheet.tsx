import { useEffect } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Bottom sheet used for the "?" info affordance: explains a status or alert
 * inline without navigating away, per spec.
 *
 * Opens with the backdrop fading and the panel sliding up from the bottom
 * edge rather than appearing instantly — a sheet that teleports in reads as
 * a browser dialog, one that travels reads as native. The grab handle at the
 * top is the standard visual cue that this is a sheet you dismiss downward.
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
        className="absolute inset-0 animate-backdrop bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="surface-lift relative w-full animate-sheet rounded-t-card border-t border-white/8 bg-surface px-6 pb-9 pt-3"
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        {/* Grab handle */}
        <div aria-hidden className="mx-auto mb-4 h-1 w-9 rounded-full bg-faint/60" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            aria-label="Close"
            onClick={onClose}
            className="press -mr-1 rounded-full p-1.5 text-muted"
          >
            <X size={20} />
          </button>
        </div>
        <div className="text-content">{children}</div>
      </div>
    </div>
  );
}

