import type { Led } from "@/api";
import { COLOR_MAP } from "@/components/BoardGrid";

interface Props {
  leds: Led[];
  /** Board dimensions — defaults match NUMB_ROWS/NUMB_COLS settings defaults */
  rows?: number;
  cols?: number;
}

/**
 * Scaled-down SVG representation of the LED board.
 * Parent controls display size via the wrapper div height; SVG fills it and
 * preserves aspect ratio. Zero server impact — renders from the leds already
 * on the Problem object.
 */
export function LedThumbnail({ leds, rows = 10, cols = 20 }: Props) {
  const cell = 5;
  const gap  = 1;
  const vw   = cols * cell + (cols - 1) * gap;
  const vh   = rows * cell + (rows - 1) * gap;

  return (
    <svg
      viewBox={`0 0 ${vw} ${vh}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={vw} height={vh} fill="#0f172a" rx={2} />
      {leds.map((l) => (
        <rect
          key={`${l.row},${l.col}`}
          x={l.col * (cell + gap)}
          y={l.row * (cell + gap)}
          width={cell}
          height={cell}
          fill={COLOR_MAP[l.rgb] ?? "#334155"}
          rx={1}
        />
      ))}
    </svg>
  );
}
