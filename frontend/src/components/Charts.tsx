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

/** Horizontal-bar climbing pyramid: hardest grade on top, bars centered. */
export function PyramidBars({
  data,
  color = "#4ade80",
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  if (data.length === 0)
    return (
      <div className="h-48 flex items-center justify-center text-sm text-slate-600">
        No sends in this period.
      </div>
    );

  const max = Math.max(1, ...data.map((d) => d.value));
  const rows = [...data].reverse(); // hardest grade on top

  return (
    <div className="flex flex-col gap-1.5 py-1">
      {rows.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-8 text-right text-xs font-medium text-slate-400 shrink-0">{d.label}</span>
          <div className="flex-1 flex justify-center">
            <div
              className="h-6 rounded transition-all"
              style={{
                width: `${(d.value / max) * 100}%`,
                minWidth: d.value > 0 ? 4 : 0,
                background: color,
              }}
            />
          </div>
          <span className={`w-6 text-xs shrink-0 ${d.value > 0 ? "text-slate-300" : "text-slate-600"}`}>{d.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Line chart with labeled axes for a single series (e.g. sends per grade). */
export function LineChart({
  data,
  color = "#4ade80",
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  if (data.length === 0)
    return (
      <div className="h-48 flex items-center justify-center text-sm text-slate-600">
        No sends in this period.
      </div>
    );

  const W = 320, H = 200, L = 26, R = 10, T = 12, B = 22;
  const plotW = W - L - R;
  const plotH = H - T - B;
  const n = data.length;

  const maxV = Math.max(1, ...data.map((d) => d.value));
  const step = Math.max(1, Math.ceil(maxV / 4));
  const steps = Math.ceil(maxV / step);
  const niceMax = step * steps;

  const X = (i: number) => L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const Y = (v: number) => T + plotH - (v / niceMax) * plotH;

  const pts = data.map((d, i) => [X(i), Y(d.value)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const baseY = (T + plotH).toFixed(1);
  const area = `${X(0).toFixed(1)},${baseY} ${line} ${X(n - 1).toFixed(1)},${baseY}`;
  const yTicks = Array.from({ length: steps + 1 }, (_, k) => k * step);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-48">
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={L} y1={Y(v)} x2={W - R} y2={Y(v)} stroke="#1e293b" strokeWidth={1} />
          <text x={L - 4} y={Y(v) + 3} textAnchor="end" fontSize={9} fill="#64748b">{v}</text>
        </g>
      ))}
      <polygon points={area} fill={color} opacity={0.14} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <g key={d.label}>
          <circle cx={X(i)} cy={Y(d.value)} r={2.6} fill={color} />
          {d.value > 0 && (
            <text x={X(i)} y={Y(d.value) - 5} textAnchor="middle" fontSize={9} fill="#cbd5e1">{d.value}</text>
          )}
          <text x={X(i)} y={H - 6} textAnchor="middle" fontSize={9} fill="#64748b">{d.label}</text>
        </g>
      ))}
    </svg>
  );
}
