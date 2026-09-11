/**
 * Tiny trend line shown beside a value, for "which way is this heading" at a
 * glance. No axes, labels or interaction — those belong to the full
 * MiniLineChart on Overview; this is purely a shape.
 */
export function Sparkline({
  data,
  color = "var(--color-brand)",
  width = 56,
  height = 20,
  className,
}: {
  /** Chronological values, oldest first. Fewer than 2 renders nothing. */
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 2;
  const plotH = height - pad * 2;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = pad + (1 - (v - min) / span) * plotH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const lastX = width;
  const lastY = pad + (1 - (data[data.length - 1] - min) / span) * plotH;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      <circle cx={lastX} cy={lastY} r="1.8" fill={color} />
    </svg>
  );
}
