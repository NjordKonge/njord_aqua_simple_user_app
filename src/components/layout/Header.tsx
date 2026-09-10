/**
 * Screen header: Njord Aqua wordmark top-left, optional action icon top-right.
 *
 * Plain text (not the logo image asset) — the image rendered poorly at this
 * size, and the app already sets Roboto as the global font, so a text
 * wordmark renders crisply at any density without needing an asset.
 */
import type { ReactNode } from "react";

export function Header({ right }: { right?: ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <span className="text-[1.0625rem] font-medium tracking-tight text-content">
        Njord Aqua
      </span>
      {right}
    </div>
  );
}

