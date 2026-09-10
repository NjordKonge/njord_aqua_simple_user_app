import { useId, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Minimal, dependency-free line chart with labeled axes (Y min/mid/max +
 * unit, X start/end), per spec's chart labeling requirement.
 *
 * The trace is a flat-coloured line plus a very light area fill fading to
 * nothing beneath it; a small dot marks only the single most recent sample
 * (not one per point). Dragging/touching the plot shows a fine vertical
 * crosshair and a compact tooltip for the nearest sample — the tooltip
 * clamps to stay on screen and sits above the touch point so a finger never
 * covers it.
 */
export function MiniLineChart({
  data,
  unit,
  xStartLabel,
  xEndLabel,
  height = 140,
  emptyLabel = "No data yet",
  color = "var(--color-brand)",
  formatTime,
}: {
  data: Array<{ t: number; v: number }>;
  unit: string;
  xStartLabel: string;
  xEndLabel: string;
  height?: number;
  emptyLabel?: string;
  /** Trace/area/dot color — CSS color value. Lets each chart on a page read
   *  as distinct at a glance instead of all sharing the same brand blue. */
  color?: string;
  /** Formats a sample's timestamp for the drag tooltip. Defaults to a plain
   *  HH:MM clock reading. */
  formatTime?: (t: number) => string;
}) {
  // Gradient ids must be unique per instance — several charts share a page.
  const gradId = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div
        className="surface-lift flex items-center justify-center rounded-card border border-border-soft bg-surface text-sm text-faint"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  const width = 320;
  const padLeft = 36;
  const padBottom = 18;
  const padTop = 8;
  const values = data.map((d) => d.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mid = (min + max) / 2;
  const span = max - min || 1;

  const plotW = width - padLeft;
  const plotH = height - padBottom - padTop;
  const tMin = data[0].t;
  const tMax = data[data.length - 1].t || tMin + 1;
  const tSpan = tMax - tMin || 1;

  const xy = data.map((d) => ({
    x: padLeft + ((d.t - tMin) / tSpan) * plotW,
    y: padTop + (1 - (d.v - min) / span) * plotH,
  }));
  const points = xy.map((p) => `${p.x},${p.y}`).join(" ");
  const baseline = padTop + plotH;
  // Same path as the line, closed down to the baseline, for the area fill.
  const areaPoints = `${xy[0].x},${baseline} ${points} ${xy[xy.length - 1].x},${baseline}`;
  const last = xy[xy.length - 1];

  const yAt = (v: number) => padTop + (1 - (v - min) / span) * plotH;

  const nearestIndex = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let bestDist = Infinity;
    for (let i = 0; i < xy.length; i++) {
      const d = Math.abs(xy[i].x - relX);
      if (d < bestDist) {
        bestDist = d;
        nearest = i;
      }
    }
    return nearest;
  };

  const handlePointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    const idx = nearestIndex(e.clientX);
    if (idx !== null) setActiveIndex(idx);
  };
  const clearActive = () => setActiveIndex(null);

  const active = activeIndex !== null ? xy[activeIndex] : null;
  const activeSample = activeIndex !== null ? data[activeIndex] : null;
  const defaultFormatTime = (t: number) =>
    new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const timeLabel = activeSample ? (formatTime ?? defaultFormatTime)(activeSample.t) : "";

  // Tooltip box, clamped so it never runs off either edge, and lifted above
  // the crosshair point so a finger never covers it.
  const tooltipW = 74;
  const tooltipX = active ? Math.min(Math.max(active.x - tooltipW / 2, 2), width - tooltipW - 2) : 0;
  const tooltipY = active ? Math.max(active.y - 34, 2) : 0;

  return (
    <div className="surface-lift rounded-card border border-border-soft bg-surface p-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height + 16}`}
        className="w-full touch-none select-none"
        onPointerDown={handlePointer}
        onPointerMove={(e) => {
          if (e.buttons === 0 && e.pointerType !== "touch") return;
          handlePointer(e);
        }}
        onPointerUp={clearActive}
        onPointerLeave={clearActive}
        onPointerCancel={clearActive}
      >
        <defs>
          <linearGradient id={`area-${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.16" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Thin, low-contrast Y gridlines + labels — sit behind the data
            rather than competing with it. */}
        {[min, mid, max].map((v, i) => (
          <g key={i}>
            <line x1={padLeft} x2={width} y1={yAt(v)} y2={yAt(v)} stroke="var(--color-border)" strokeWidth="1" />
            <text x={0} y={yAt(v) + 4} fontSize="10.5" fill="var(--color-faint)">
              {Math.round(v)}
              {unit}
            </text>
          </g>
        ))}

        <polygon points={areaPoints} fill={`url(#area-${gradId})`} />

        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Latest sample */}
        <circle cx={last.x} cy={last.y} r="2.5" fill={color} stroke="var(--color-surface)" strokeWidth="1.5" />

        {/* X start/end labels */}
        <text x={padLeft} y={height + 14} fontSize="10.5" fill="var(--color-faint)">
          {xStartLabel}
        </text>
        <text x={width} y={height + 14} fontSize="10.5" fill="var(--color-faint)" textAnchor="end">
          {xEndLabel}
        </text>

        {/* Drag/touch crosshair + tooltip for the nearest sample. */}
        {active && activeSample && (
          <g>
            <line x1={active.x} x2={active.x} y1={padTop} y2={baseline} stroke="var(--color-brand-deep)" strokeWidth="1" strokeDasharray="2 2" />
            <circle cx={active.x} cy={active.y} r="3.5" fill="var(--color-brand-deep)" stroke="var(--color-surface)" strokeWidth="1.5" />
            <rect x={tooltipX} y={tooltipY} width={tooltipW} height={26} rx={6} fill="var(--color-content)" opacity="0.94" />
            <text x={tooltipX + tooltipW / 2} y={tooltipY + 10.5} textAnchor="middle" fontSize="9" fill="var(--color-on-fill)" opacity="0.8">
              {timeLabel}
            </text>
            <text x={tooltipX + tooltipW / 2} y={tooltipY + 21} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--color-on-fill)">
              {Math.round(activeSample.v * 10) / 10}
              {unit}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
