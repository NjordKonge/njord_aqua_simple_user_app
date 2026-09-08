import { useId } from "react";

/**
 * Minimal, dependency-free line chart with labeled axes (Y min/mid/max +
 * unit, X start/end), per spec's chart labeling requirement.
 *
 * The trace is drawn as a stroked line plus a gradient area fading to nothing
 * beneath it, with a lit dot on the most recent sample. The area is what
 * gives a sparse, noisy series visual weight; the end dot answers "which end
 * is now" without needing to read the axis label.
 */
export function MiniLineChart({
  data,
  unit,
  xStartLabel,
  xEndLabel,
  height = 140,
  emptyLabel = "No data yet",
  color = "var(--color-brand)",
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
}) {
  // Gradient ids must be unique per instance — several charts share a page.
  const gradId = useId().replace(/:/g, "");

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

  return (
    <div className="surface-lift rounded-card border border-border-soft bg-surface p-3">
      <svg viewBox={`0 0 ${width} ${height + 16}`} className="w-full">
        <defs>
          <linearGradient id={`area-${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.34" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y gridlines + labels. Dashed and dim so they sit behind the data
            rather than competing with it. */}
        {[min, mid, max].map((v, i) => (
          <g key={i}>
            <line
              x1={padLeft}
              x2={width}
              y1={yAt(v)}
              y2={yAt(v)}
              stroke="var(--color-border)"
              strokeWidth="1"
              strokeDasharray="2 4"
            />
            <text x={0} y={yAt(v) + 4} fontSize="9.5" fill="var(--color-faint)">
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
          style={{ filter: `drop-shadow(0 0 4px color-mix(in srgb, ${color} 55%, transparent))` }}
        />

        {/* Latest sample */}
        <circle
          cx={last.x}
          cy={last.y}
          r="3"
          fill={color}
          stroke="var(--color-surface)"
          strokeWidth="1.5"
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />

        {/* X start/end labels */}
        <text x={padLeft} y={height + 14} fontSize="9.5" fill="var(--color-faint)">
          {xStartLabel}
        </text>
        <text x={width} y={height + 14} fontSize="9.5" fill="var(--color-faint)" textAnchor="end">
          {xEndLabel}
        </text>
      </svg>
    </div>
  );
}
