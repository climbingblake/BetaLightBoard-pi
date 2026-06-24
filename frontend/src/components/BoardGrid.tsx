import { useRef, useEffect, useState } from "react";
import type { Led } from "@/api";

const COLOR_MAP: Record<string, string> = {
  green:     "#00c853",
  blue:      "#2979ff",
  purple:    "#aa00ff",
  red:       "#ff1744",
  orange:    "#ff6d00",
  lightblue: "#00b0ff",
  white:     "#ffffff",
  black:     "#1e293b",
  off:       "#1e293b",
};

const COLOR_CYCLE = ["green", "blue", "purple", "orange", "red", "lightblue", "white", "off"];

interface BoardGridProps {
  rows: number;
  cols: number;
  leds: Led[];
  selectedColor?: string;
  onCellClick: (row: number, col: number, existingLed: Led | undefined) => void;
  readOnly?: boolean;
}

export function BoardGrid({ rows, cols, leds, onCellClick, readOnly }: BoardGridProps) {
  const ledMap = new Map<string, Led>();
  for (const l of leds) ledMap.set(`${l.row},${l.col}`, l);

  const containerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(60);

  useEffect(() => {
    function measure() {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      const gap = 4;
      const byWidth  = Math.floor((width  - gap * (cols - 1) - 16) / cols);
      const byHeight = Math.floor((height - gap * (rows - 1) - 16) / rows);
      setCellSize(Math.min(byWidth, byHeight, 72));
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [rows, cols]);

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center">
    <div
      className="inline-grid gap-1 p-2"
      style={{
        gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
        gridTemplateRows:    `repeat(${rows}, ${cellSize}px)`,
      }}
    >
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const key = `${r},${c}`;
          const led = ledMap.get(key);
          const bg = led ? (COLOR_MAP[led.rgb] ?? "#334155") : "#0f172a";

          return (
            <div
              key={key}
              className="hold-cell"
              style={{ backgroundColor: bg, width: cellSize, height: cellSize }}
              onClick={() => !readOnly && onCellClick(r, c, led)}
              title={led ? `${led.rgb} (${r},${c})` : `(${r},${c})`}
            />
          );
        })
      )}
    </div>
    </div>
  );
}

export { COLOR_MAP, COLOR_CYCLE };
