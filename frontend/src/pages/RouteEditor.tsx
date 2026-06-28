import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/api";
import type { Route, RouteHold } from "@/api";
import { canEdit } from "@/lib/perms";
import { useAuth } from "@/store/useAuth";

// Violet → Orange gradient (first hold = violet, last = orange)
function holdColor(index: number, total: number): string {
  if (total === 0) return "#334155";
  const t = total === 1 ? 1 : index / (total - 1);
  const hue = 270 - t * 240; // 270 = violet, 30 = orange
  return `hsl(${hue}, 90%, 55%)`;
}

export default function RouteEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [route, setRoute] = useState<Route | null>(null);
  const [rows, setRows] = useState(10);
  const [cols, setCols] = useState(20);

  // pending: a cell that has been clicked once but not confirmed
  const [pending, setPending] = useState<{ row: number; col: number } | null>(null);

  // edit mode — off by default so a stray tap can't place/remove holds
  const [editMode, setEditMode] = useState(false);
  // editing meta
  const [editingMeta, setEditingMeta] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("3.0");
  const [numberShown, setNumberShown] = useState("3");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(60);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.routes.get(Number(id)).then((r) => {
      // Non-owners can't edit; bounce them to the read-only view.
      if (!canEdit(user, r.created_by)) {
        navigate(`/routes/${id}`, { replace: true });
        return;
      }
      setRoute(r);
      setName(r.name ?? "");
      setDescription(r.description ?? "");
      setDuration(String(r.duration));
      setNumberShown(String(r.number_shown));
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

  async function handleCellClick(r: number, c: number, existingHold: RouteHold | undefined) {
    if (!route || !id || !editMode) return;

    // Can't click an already-confirmed hold
    if (existingHold) return;

    if (pending && pending.row === r && pending.col === c) {
      // Second click on same cell — confirm
      const hold = await api.routes.addHold(Number(id), r, c);
      setRoute((prev) => prev ? {
        ...prev,
        holds: [...prev.holds, hold],
      } : prev);
      setPending(null);
      setStatus(`Hold #${hold.sequence + 1} added`);
      setTimeout(() => setStatus(""), 1500);
    } else {
      // First click — set pending and preview on strip
      setPending({ row: r, col: c });
      await api.routes.preview(Number(id), r, c);
    }
  }

  function toggleEditMode() {
    setEditMode((on) => {
      if (on) { setEditingMeta(false); setPending(null); }
      return !on;
    });
  }

  async function handleRemoveLast() {
    if (!route || !id || route.holds.length === 0) return;
    await api.routes.removeLastHold(Number(id));
    setRoute((prev) => prev ? {
      ...prev,
      holds: prev.holds.slice(0, -1),
    } : prev);
  }

  async function handleSaveMeta() {
    if (!route || !id) return;
    setSaving(true);
    const updated = await api.routes.update(Number(id), {
      name,
      description: description || null,
      duration: parseFloat(duration) || 3.0,
      number_shown: parseInt(numberShown) || 3,
    });
    setRoute((prev) => prev ? { ...prev, ...updated } : prev);
    setSaving(false);
    setEditingMeta(false);
  }

  async function handleDelete() {
    if (!route || !id || !confirm(`Delete "${route.name}"?`)) return;
    await api.routes.delete(Number(id));
    navigate("/routes");
  }

  if (!route) return <div className="p-6 text-slate-500">Loading...</div>;

  const holdMap = new Map<string, RouteHold>();
  for (const h of route.holds) holdMap.set(`${h.row},${h.col}`, h);
  const total = route.holds.length;

  return (
    <div className="flex h-[calc(100vh-49px)]">
      {/* Board */}
      <div ref={containerRef} className="flex-1 relative flex items-center justify-center bg-slate-950 overflow-hidden">
        <button
          className="lg:hidden absolute top-3 right-3 z-10 p-2 bg-slate-800/80 rounded text-slate-300 hover:text-slate-100 text-lg leading-none"
          onClick={() => setSidebarOpen(true)}
        >☰</button>
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
              const isPending = !hold && pending?.row === r && pending?.col === c;
              const bg = hold
                ? holdColor(hold.sequence, total)
                : isPending
                ? "#dbb800" // yellow
                : "#0f172a";

              return (
                <div
                  key={key}
                  className={`hold-cell transition-colors duration-100 ${editMode ? "cursor-pointer" : "cursor-default"}`}
                  style={{
                    backgroundColor: bg,
                    width: cellSize,
                    height: cellSize,
                    opacity: hold ? 0.85 : 1,
                    outline: isPending ? "2px solid #dbb800" : undefined,
                  }}
                  onClick={() => handleCellClick(r, c, hold)}
                  title={
                    hold ? `Hold #${hold.sequence + 1} (${r},${c})`
                    : isPending ? `Pending (${r},${c}) — click again to confirm`
                    : `(${r},${c})`
                  }
                >
                  {hold && (
                    <span
                      className="flex items-center justify-center w-full h-full text-black font-bold select-none"
                      style={{ fontSize: Math.max(cellSize * 0.3, 10) }}
                    >
                      {hold.sequence + 1}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/60" onClick={() => setSidebarOpen(false)} />
      )}
      {/* Sidebar */}
      <div className={`w-64 border-l border-slate-800 bg-slate-900 flex-col gap-5 p-5 overflow-y-auto ${sidebarOpen ? "fixed inset-y-0 right-0 z-40 flex" : "hidden lg:flex"}`}>
        <button className="lg:hidden self-end text-slate-500 hover:text-slate-300 text-xl leading-none mb-1" onClick={() => setSidebarOpen(false)}>✕</button>
        {/* Meta */}
        {editingMeta ? (
          <div className="flex flex-col gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Route name"
              className="bg-slate-800 border border-slate-700 text-slate-100 rounded px-3 py-2 text-sm w-full"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="bg-slate-800 border border-slate-700 text-slate-100 rounded px-3 py-2 text-sm w-full resize-none"
            />
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">Duration per hold (s)</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-100 rounded px-3 py-2 text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">Holds shown at once</label>
              <input
                type="number"
                min="1"
                max="10"
                value={numberShown}
                onChange={(e) => setNumberShown(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-100 rounded px-3 py-2 text-sm w-full"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveMeta}
                disabled={saving}
                className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditingMeta(false)}
                className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className={editMode ? "cursor-pointer group" : ""} onClick={editMode ? () => setEditingMeta(true) : undefined}>
            <div className="flex items-start justify-between">
              <h2 className="text-slate-100 font-semibold text-lg leading-tight">
                {route.name || "Untitled"}
              </h2>
              {editMode && <span className="text-xs text-slate-600 group-hover:text-slate-400 ml-2 mt-1">edit</span>}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">{route.duration}s/hold</span>
              <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">{route.number_shown} shown</span>
            </div>
          </div>
        )}

        <hr className="border-slate-800" />

        {/* Edit-mode toggle — off by default so a stray tap can't change holds */}
        <button
          onClick={toggleEditMode}
          className={`w-full py-2 rounded text-sm font-medium transition-colors ${
            editMode
              ? "bg-amber-600 hover:bg-amber-500 text-white"
              : "bg-slate-800 hover:bg-slate-700 text-slate-300"
          }`}
        >
          {editMode ? "✓ Done editing" : "✎ Edit holds"}
        </button>

        {/* Instructions */}
        {editMode ? (
          <div className="text-xs text-slate-500 leading-relaxed">
            {pending ? (
              <span className="text-yellow-500">
                LED lit yellow. Click the same cell again to confirm, or click another to preview it instead.
              </span>
            ) : (
              "Click a cell to preview it on the board. Click the same cell again to add it to the sequence."
            )}
          </div>
        ) : (
          <div className="text-xs text-slate-600 leading-relaxed">
            View only. Tap “Edit holds” to change the sequence.
          </div>
        )}

        <div className="text-sm text-slate-400">
          {total === 0 ? "No holds yet" : `${total} hold${total !== 1 ? "s" : ""}`}
        </div>

        <hr className="border-slate-800" />

        <div className="flex flex-col gap-2">
          {editMode && (
            <button
              onClick={handleRemoveLast}
              disabled={total === 0}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm transition-colors disabled:opacity-40"
            >
              ↩ Remove Last Hold
            </button>
          )}
          <button
            onClick={() => navigate(`/routes/${route.id}`)}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm transition-colors"
          >
            View / Play
          </button>
          {editMode && (
            <button
              onClick={handleDelete}
              className="w-full py-2 hover:bg-red-900/30 text-slate-500 hover:text-red-400 rounded text-sm transition-colors"
            >
              Delete Route
            </button>
          )}
          <button
            onClick={() => navigate("/routes")}
            className="w-full py-2 text-slate-600 hover:text-slate-400 rounded text-sm transition-colors"
          >
            ← Back
          </button>
        </div>

        {status && <p className="text-xs text-green-500 text-center">{status}</p>}
      </div>
    </div>
  );
}
