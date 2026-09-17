/**
 * Screen header: Njord Aqua wordmark top-left, optional small-caps tagline
 * beneath it, optional action icon top-right.
 *
 * Plain text (not the logo image asset) — the image rendered poorly at this
 * size, and the app already sets Roboto as the global font, so a text
 * wordmark renders crisply at any density without needing an asset.
 */
import type { ReactNode } from "react";

export function Header({ right, tagline }: { right?: ReactNode; tagline?: string }) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div className="min-w-0">
        <span className="block text-[1.375rem] font-bold tracking-tight text-content">
          Njord Aqua
        </span>
        {tagline ? (
          <span className="type-cap mt-0.5 block whitespace-pre-line leading-snug text-faint">{tagline}</span>
        ) : null}
      </div>
      {right}
    </div>
  );
}

