import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/api";
import type { Route, RouteHold } from "@/api";
import { ActivityPanel } from "@/components/ActivityPanel";

// Violet → Orange gradient across all holds (first = violet, last = orange)
function holdColor(index: number, total: number): string {
  if (total === 0) return "#334155";
  const t = total === 1 ? 0 : index / (total - 1); // 0 = violet, 1 = orange
  // Hue: violet ≈ 270°, orange ≈ 30°
  const hue = 270 - t * 240;
  return `hsl(${hue}, 90%, 55%)`;
}

export default function RouteShow() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [route, setRoute] = useState<Route | null>(null);
  const [rows, setRows] = useState(10);
  const [cols, setCols] = useState(20);
  const [playing, setPlaying] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(60);

  useEffect(() => {
    if (!id) return;
    api.routes.get(Number(id)).then((r) => {
      setRoute(r);
      setRepeat(r.repeat);
    });
    api.settings.list().then((s) => {
      const r = s.find((x) => x.key === "NUMB_ROWS")?.value;
      const c = s.find((x) => x.key === "NUMB_COLS")?.value;
      if (r) setRows(Number(r));
      if (c) setCols(Number(c));
    });
  }, [id]);

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

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPolling = useCallback(() => {
    if (!id) return;
    stopPolling();
    pollRef.current = setInterval(async () => {
      const s = await api.routes.status(Number(id));
      setCurrentIndex(s.current_index);
      if (!s.playing) {
        setPlaying(false);
        setCurrentIndex(null);
        stopPolling();
      }
    }, 200);
  }, [id, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  async function handlePlay() {
    if (!route) return;
    await api.routes.play(route.id, repeat);
    setPlaying(true);
    startPolling();
  }

  async function handleStop() {
    if (!route) return;
    await api.routes.stop(route.id);
    setPlaying(false);
    setCurrentIndex(null);
    stopPolling();
  }

  if (!route) return <div className="p-6 text-slate-500">Loading...</div>;

  const holdMap = new Map<string, RouteHold>();
  for (const h of route.holds) holdMap.set(`${h.row},${h.col}`, h);

  return (
    <div className="flex h-[calc(100vh-49px)]">
      {/* Board */}
      <div ref={containerRef} className="flex-1 flex items-center justify-center bg-slate-950 overflow-hidden">
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
              const hold = holdMap.get(key);
              const isActive = playing && currentIndex !== null && hold && hold.sequence <= currentIndex;
              const bg = hold
                ? holdColor(hold.sequence, route.holds.length)
                : "#0f172a";

              return (
                <div
                  key={key}
                  className="hold-cell transition-all duration-200"
                  style={{
                    backgroundColor: bg,
                    width: cellSize,
                    height: cellSize,
                    opacity: hold ? (isActive ? 1 : 0.35) : 1,
                    boxShadow: isActive && hold?.sequence === currentIndex
                      ? "0 0 8px 2px rgba(255,160,50,0.6)"
                      : undefined,
                  }}
                  title={hold ? `#${hold.sequence + 1} (${r},${c})` : `(${r},${c})`}
                />
              );
            })
          )}
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-64 border-l border-slate-800 bg-slate-900 flex flex-col gap-5 p-5 overflow-y-auto">
        <div>
          <h2 className="text-slate-100 font-semibold text-lg leading-tight">
            {route.name || "Untitled"}
          </h2>
          {route.description && (
            <p className="text-xs text-slate-500 mt-1">{route.description}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
              {route.holds.length} holds
            </span>
            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
              {route.duration}s/hold
            </span>
            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
              {route.number_shown} shown
            </span>
          </div>
        </div>

        <hr className="border-slate-800" />

        {/* Progress */}
        {playing && currentIndex !== null && (
          <div>
            <div className="text-xs text-slate-500 mb-1">
              Hold {currentIndex + 1} / {route.holds.length}
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 transition-all duration-200"
                style={{ width: `${((currentIndex + 1) / route.holds.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Repeat toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            className={`w-9 h-5 rounded-full transition-colors ${repeat ? "bg-blue-600" : "bg-slate-700"} relative`}
            onClick={() => setRepeat((r) => !r)}
          >
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${repeat ? "translate-x-4" : "translate-x-0.5"}`} />
          </div>
          <span className="text-sm text-slate-400">Repeat</span>
        </label>

        {/* Play / Stop */}
        <div className="flex flex-col gap-2">
          {!playing ? (
            <button
              onClick={handlePlay}
              disabled={route.holds.length === 0}
              className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
            >
              ▶ Play
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-sm font-medium transition-colors"
            >
              ■ Stop
            </button>
          )}
          <button
            onClick={() => navigate(`/routes/${route.id}/edit`)}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm transition-colors"
          >
            Edit Route
          </button>
          <button
            onClick={() => navigate("/routes")}
            className="w-full py-2 text-slate-600 hover:text-slate-400 rounded text-sm transition-colors"
          >
            ← Back
          </button>
        </div>

        <ActivityPanel routeId={route.id} />
      </div>
    </div>
  );
}
