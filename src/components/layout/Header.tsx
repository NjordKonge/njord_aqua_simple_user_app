/**
 * Screen header: Njord wordmark top-left, optional action icon top-right.
 */
import type { ReactNode } from "react";

export function Header({ right }: { right?: ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <img src="/njord-logo-white.png" alt="Njord" className="h-6 w-auto" />
      {right}
    </div>
  );
}
