import { cn } from "@/lib/utils";

/**
 * Minimal, dependency-free bar chart with labeled axes, per spec. Used for
 * daily water consumption — today's bar highlighted in accent blue.
 */
export function MiniBarChart({
  data,
  unit,
  height = 160,
  onSelect,
}: {
  data: Array<{ label: string; value: number; highlight?: boolean }>;
  unit: string;
  height?: number;
  onSelect?: (index: number) => void;
}) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-card bg-surface-muted text-sm text-muted"
        style={{ height }}
      >
        No data yet
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const gridValues = [0, max / 2, max];

  return (
    <div>
      <div className="flex" style={{ height }}>
        {/* Y-axis labels */}
        <div className="flex flex-col justify-between pr-2 text-right text-xs text-muted">
          {gridValues
            .slice()
            .reverse()
            .map((v) => (
              <span key={v}>
                {Math.round(v)}
                {unit}
              </span>
            ))}
        </div>

        {/* Bars */}
        <div className="flex flex-1 items-end gap-1.5 border-l border-border pl-2">
          {data.map((d, i) => (
            <button
              key={i}
              onClick={() => onSelect?.(i)}
              className="flex flex-1 flex-col items-center justify-end gap-1"
              aria-label={`${d.label}: ${d.value}${unit}`}
            >
              <div
                className={cn(
                  "w-full rounded-t-sm",
                  d.highlight ? "bg-brand" : "bg-surface-muted",
                )}
                style={{ height: `${(d.value / max) * 100}%`, minHeight: 2 }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* X-axis labels */}
      <div className="mt-1 flex gap-1.5 pl-8">
        {data.map((d, i) => (
          <span key={i} className="flex-1 text-center text-[10px] text-muted">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
