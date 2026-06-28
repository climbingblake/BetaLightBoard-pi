// Dependency-free SVG/CSS charts tuned for the dark slate theme.

/** Tiny inline trend line for stat cards. */
export function Sparkline({ data, color = "#38bdf8", className = "" }: { data: number[]; color?: string; className?: string }) {
  const n = data.length;
  if (n === 0) return null;
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => {
    const x = n === 1 ? 100 : (i / (n - 1)) * 100;
    const y = 28 - (v / max) * 26 - 1;
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,28 ${line} 100,28`;
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className={`w-full h-8 ${className}`}>
      <polygon points={area} fill={color} opacity={0.18} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Vertical bar chart (CSS columns) for categorical data like grade counts. */
export function BarChart({ data, color = "#60a5fa" }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-1.5 h-44 w-full">
      {data.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
          <span className="text-[10px] text-slate-500 mb-1 leading-none">{d.value || ""}</span>
          <div
            className="w-full rounded-t transition-all"
            style={{
              height: `${(d.value / max) * 100}%`,
              minHeight: d.value > 0 ? 3 : 0,
              background: `linear-gradient(180deg, ${color}, ${color}99)`,
            }}
            title={`${d.label}: ${d.value}`}
          />
          <span className="text-[10px] text-slate-500 mt-1 leading-none truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Stacked area chart (two series) over evenly spaced buckets. */
export function StackedArea({
  data,
  colorA = "#3b82f6",
  colorB = "#f97316",
}: {
  data: { lower: number; upper: number }[];
  colorA?: string;
  colorB?: string;
}) {
  const n = data.length;
  if (n === 0) return null;
  const max = Math.max(1, ...data.map((d) => d.lower + d.upper));
  const X = (i: number) => (n === 1 ? 100 : (i / (n - 1)) * 100);
  const Y = (v: number) => 100 - (v / max) * 100;

  const lowerLine = data.map((d, i) => `${X(i).toFixed(2)},${Y(d.lower).toFixed(2)}`);
  const totalLine = data.map((d, i) => `${X(i).toFixed(2)},${Y(d.lower + d.upper).toFixed(2)}`);

  const areaLower = `0,100 ${lowerLine.join(" ")} 100,100`;
  const areaUpper = `${lowerLine.join(" ")} ${[...totalLine].reverse().join(" ")}`;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-48">
      <polygon points={areaLower} fill={colorA} opacity={0.5} />
      <polygon points={areaUpper} fill={colorB} opacity={0.4} />
      <polyline points={lowerLine.join(" ")} fill="none" stroke={colorA} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <polyline points={totalLine.join(" ")} fill="none" stroke={colorB} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
