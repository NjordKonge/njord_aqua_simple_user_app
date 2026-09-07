/**
 * Minimal, dependency-free line chart with labeled axes (Y min/mid/max +
 * unit, X start/end), per spec's chart labeling requirement.
 */
export function MiniLineChart({
  data,
  unit,
  xStartLabel,
  xEndLabel,
  height = 140,
  emptyLabel = "No data yet",
}: {
  data: Array<{ t: number; v: number }>;
  unit: string;
  xStartLabel: string;
  xEndLabel: string;
  height?: number;
  emptyLabel?: string;
}) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-card bg-surface-muted text-sm text-muted"
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

  const points = data
    .map((d) => {
      const x = padLeft + ((d.t - tMin) / tSpan) * plotW;
      const y = padTop + (1 - (d.v - min) / span) * plotH;
      return `${x},${y}`;
    })
    .join(" ");

  const yAt = (v: number) => padTop + (1 - (v - min) / span) * plotH;

  return (
    <svg viewBox={`0 0 ${width} ${height + 16}`} className="w-full">
      {/* Y gridlines + labels */}
      {[min, mid, max].map((v, i) => (
        <g key={i}>
          <line
            x1={padLeft}
            x2={width}
            y1={yAt(v)}
            y2={yAt(v)}
            stroke="var(--color-border)"
            strokeWidth="1"
          />
          <text x={0} y={yAt(v) + 4} fontSize="10" fill="var(--color-muted)">
            {Math.round(v)}
            {unit}
          </text>
        </g>
      ))}

      <polyline points={points} fill="none" stroke="var(--color-brand)" strokeWidth="2" />

      {/* X start/end labels */}
      <text x={padLeft} y={height + 14} fontSize="10" fill="var(--color-muted)">
        {xStartLabel}
      </text>
      <text x={width} y={height + 14} fontSize="10" fill="var(--color-muted)" textAnchor="end">
        {xEndLabel}
      </text>
    </svg>
  );
}
