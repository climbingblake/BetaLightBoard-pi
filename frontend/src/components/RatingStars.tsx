import { useState } from "react";

const MAX = 3;

interface DisplayProps {
  /** Average rating value (0-3), or null when unrated. */
  avg: number | null;
  count: number;
  className?: string;
}

/** Read-only fractional star display, e.g. ★★½ 2.3 (8). */
export function RatingDisplay({ avg, count, className = "" }: DisplayProps) {
  if (avg == null || count === 0) {
    return <span className={`text-xs text-slate-600 ${className}`}>unrated</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} title={`${avg.toFixed(2)} from ${count} rating${count === 1 ? "" : "s"}`}>
      <span className="inline-flex">
        {Array.from({ length: MAX }, (_, i) => {
          const fill = Math.max(0, Math.min(1, avg - i)) * 100;
          return (
            <span key={i} className="relative text-sm leading-none">
              <span className="text-slate-700">★</span>
              <span
                className="absolute inset-0 overflow-hidden text-yellow-400"
                style={{ width: `${fill}%` }}
              >
                ★
              </span>
            </span>
          );
        })}
      </span>
      <span className="text-xs text-slate-400">{avg.toFixed(1)}</span>
      <span className="text-xs text-slate-600">({count})</span>
    </span>
  );
}

interface InputProps {
  /** Current user's rating (0-3) or null if not yet rated. */
  value: number | null;
  onChange: (stars: number) => void;
  disabled?: boolean;
}

/** Interactive 0-3 star picker. The "none" control sets a valid 0-star rating. */
export function RatingInput({ value, onChange, disabled }: InputProps) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;

  return (
    <div className="flex items-center gap-2">
      <div className="flex" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: MAX }, (_, i) => {
          const n = i + 1;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onMouseEnter={() => setHover(n)}
              onClick={() => onChange(n)}
              className={`text-xl leading-none px-0.5 transition-colors disabled:opacity-50 ${
                n <= shown ? "text-yellow-400" : "text-slate-700 hover:text-slate-500"
              }`}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
            >
              ★
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(0)}
        className={`text-xs transition-colors disabled:opacity-50 ${
          value === 0 ? "text-slate-300" : "text-slate-600 hover:text-slate-400"
        }`}
      >
        0 / none
      </button>
    </div>
  );
}
