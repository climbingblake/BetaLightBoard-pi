import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useProblemStore } from "@/store/useProblemStore";
import { BoardGrid } from "@/components/BoardGrid";
import { ColorPicker } from "@/components/ColorPicker";
import { api } from "@/api";
import type { Led, Problem, SortKey } from "@/api";
import { ActivityPanel } from "@/components/ActivityPanel";
import { RatingDisplay } from "@/components/RatingStars";
import { fmtSendRate } from "@/lib/format";
import { canEdit } from "@/lib/perms";
import { useAuth } from "@/store/useAuth";
import { applyProblemFilters } from "@/lib/problemFilters";

const GRADES = ["V0","V1","V2","V3","V4","V5","V6","V7","V8","V9","V10","V11","V12"];

export default function ProblemEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { current, loading, fetchProblem, updateProblem, addLed, updateLed, deleteLed, loadToBoard, clearBoard, deleteProblem } =
    useProblemStore();
  const { user } = useAuth();

  const [searchParams] = useSearchParams();
  const gradesKey = searchParams.get("grades") ?? "";
  const ratingsKey = searchParams.get("ratings") ?? "";
  const ascentsKey = searchParams.get("ascents") ?? "";
  const setter = searchParams.get("setter") ?? "ALL";
  const sort = (searchParams.get("sort") ?? "created_desc") as SortKey;
  const favoritesOnly = searchParams.get("fav") === "1";
  const selectedRatings = useMemo(() => new Set(ratingsKey ? ratingsKey.split(",") : []), [ratingsKey]);
  const selectedAscents = useMemo(() => new Set(ascentsKey ? ascentsKey.split(",") : []), [ascentsKey]);
  const [list, setList] = useState<Problem[]>([]);

  const [selectedColor, setSelectedColor] = useState("blue");
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState(10);
  const [cols, setCols] = useState(10);
  const [autoLoad, setAutoLoad] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (id && id !== "new") fetchProblem(Number(id));
    api.settings.list().then((settings) => {
      const r = settings.find((s) => s.key === "NUMB_ROWS")?.value;
      const c = settings.find((s) => s.key === "NUMB_COLS")?.value;
      const a = settings.find((s) => s.key === "AUTO_LOAD")?.value;
      if (r) setRows(Number(r));
      if (c) setCols(Number(c));
      setAutoLoad(a === "1");
    });
  }, [id]);

  // Rebuild the filtered + sorted list the user came from, straight from the URL
  // params, so prev/next survives refresh and deep links.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [items, favs] = await Promise.all([
        api.problems.list({
          grades: gradesKey || undefined,
          setter: setter !== "ALL" ? setter : undefined,
          sort,
        }),
        api.favorites.list("problem"),
      ]);
      if (cancelled) return;
      const favIds = new Set(favs.filter((f) => f.problem_id != null).map((f) => f.problem_id!));
      setList(applyProblemFilters(items, selectedRatings, selectedAscents, favoritesOnly, favIds));
    })();
    return () => { cancelled = true; };
  }, [gradesKey, ratingsKey, ascentsKey, setter, sort, favoritesOnly]);

  useEffect(() => {
    if (current) {
      setName(current.name ?? "");
      setGrade(current.grade ?? "");
      setDescription(current.description ?? "");
    }
  }, [current]);

  async function handleCellClick(row: number, col: number, existing: Led | undefined) {
    if (!current) return;

    if (existing) {
      if (selectedColor === "off" || existing.rgb === selectedColor) {
        await deleteLed(existing.id);
      } else {
        await updateLed(existing.id, selectedColor);
      }
    } else if (selectedColor !== "off") {
      await addLed(current.id, row, col, selectedColor);
    }
  }

  async function handleSaveMeta() {
    if (!current) return;
    setSaving(true);
    await updateProblem(current.id, { name, grade, description });
    setSaving(false);
    setEditing(false);
  }

  async function handleLoad() {
    if (!current) return;
    await loadToBoard(current.id);
    setStatus("Loaded to board");
    setTimeout(() => setStatus(""), 2000);
  }

  async function handleClear() {
    if (!current || !confirm("Clear all holds?")) return;
    await clearBoard(current.id);
    setStatus("Board cleared");
    setTimeout(() => setStatus(""), 2000);
  }

  async function handleDelete() {
    if (!current || !confirm("Delete this problem? This cannot be undone.")) return;
    await deleteProblem(current.id);
    navigate("/problems");
  }

  if (loading) return <div className="p-6 text-slate-500">Loading...</div>;
  if (!current) return <div className="p-6 text-slate-500">Problem not found.</div>;

  const canModify = canEdit(user, current.created_by);
  const liveEdit = canModify && editMode;

  const idx = list.findIndex((p) => p.id === Number(id));
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

  function go(targetId: number) {
    if (autoLoad) {
      api.problems.load(targetId).catch(() => {});
    }
    navigate({ pathname: `/problems/${targetId}`, search: searchParams.toString() });
  }

  function toggleEditMode() {
    setEditMode((on) => {
      if (on) setEditing(false);
      return !on;
    });
  }

  return (
    <div className="flex h-[calc(100vh-49px)]">
      {/* Board */}
      <div className="flex-1 relative flex items-center justify-center bg-slate-950 overflow-hidden">
        <button
          className="lg:hidden absolute top-3 right-3 z-10 p-2 bg-slate-800/80 rounded text-slate-300 hover:text-slate-100 text-lg leading-none"
          onClick={() => setSidebarOpen(true)}
        >☰</button>
        <BoardGrid
          rows={rows}
          cols={cols}
          leds={current.leds}
          selectedColor={selectedColor}
          onCellClick={handleCellClick}
          readOnly={!liveEdit}
        />
      </div>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/60" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`w-64 border-l border-slate-800 bg-slate-900 flex-col gap-5 p-5 overflow-y-auto ${sidebarOpen ? "fixed inset-y-0 right-0 z-40 flex" : "hidden lg:flex"}`}>
        <button className="lg:hidden self-end text-slate-500 hover:text-slate-300 text-xl leading-none mb-1" onClick={() => setSidebarOpen(false)}>✕</button>

        {list.length > 1 && idx >= 0 && (
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => prev && go(prev.id)}
              disabled={!prev}
              className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm transition-colors disabled:opacity-40"
            >
              ‹ Prev
            </button>
            <span className="text-xs text-slate-500 whitespace-nowrap">{idx + 1} of {list.length}</span>
            <button
              onClick={() => next && go(next.id)}
              disabled={!next}
              className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm transition-colors disabled:opacity-40"
            >
              Next ›
            </button>
          </div>
        )}

        {/* Problem meta */}
        <div>
          {editing ? (
            <div className="flex flex-col gap-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className="bg-slate-800 border border-slate-700 text-slate-100 rounded px-3 py-2 text-sm w-full"
              />
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-2 text-sm"
              >
                <option value="">Grade</option>
                {GRADES.map((g) => <option key={g}>{g}</option>)}
              </select>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="bg-slate-800 border border-slate-700 text-slate-100 rounded px-3 py-2 text-sm w-full resize-none"
              />
              {canModify && (
                <button
                  onClick={toggleEditMode}
                  className={`w-full py-2 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                    editMode
                      ? "bg-amber-600 hover:bg-amber-500 text-white"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                  }`}
                >
                  <span>{editMode ? "✓ Done editing" : "✎ Edit holds"}</span>
                </button>
              )}
              {liveEdit && (
                <p className="text-xs text-amber-500/80 -mt-1">Edit mode on — tap the board to place or remove holds.</p>
              )}
              {liveEdit && (
                <ColorPicker selected={selectedColor} onChange={setSelectedColor} />
              )}
              {liveEdit && (
                <button
                  onClick={handleClear}
                  className="w-full py-2 hover:bg-red-900/30 text-slate-500 hover:text-red-400 rounded text-sm transition-colors"
                >
                  Clear All
                </button>
              )}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleSaveMeta}
                  disabled={saving}
                  className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm"
                >
                  Cancel
                </button>
              </div>
              {canModify && (
                <button
                  onClick={handleDelete}
                  className="w-full py-2 hover:bg-red-900/30 text-slate-600 hover:text-red-400 rounded text-sm transition-colors"
                >
                  Delete Problem
                </button>
              )}
            </div>
          ) : (
            <div
              className={canModify ? "cursor-pointer group" : ""}
              onClick={canModify ? () => setEditing(true) : undefined}
            >
              <div className="flex items-start justify-between">
                <h2 className="text-slate-100 font-semibold text-lg leading-tight">
                  {current.name || "Untitled"}
                </h2>
                {canModify && (
                  <span className="text-xs text-slate-600 group-hover:text-slate-400 ml-2 mt-1">edit</span>
                )}
              </div>
              {current.grade && (
                <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                  {current.grade}
                </span>
              )}
              {current.setter && (
                <p className="text-xs text-slate-600 mt-1">by {current.setter}</p>
              )}
              {current.description && (
                <p className="text-xs text-slate-500 mt-2 whitespace-pre-line">{current.description}</p>
              )}
            </div>

          )}
          <div className="mt-2">
            <RatingDisplay avg={current.rating_avg} count={current.rating_count} />
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {current.ascents} ascents · {fmtSendRate(current.send_rate)} send rate
          </div>
        </div>

        {!editing && (
          <>
            <button
              onClick={handleLoad}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-sm transition-colors"
            >
              Load to Board
            </button>

            {status && (
              <p className="text-xs text-green-500 text-center">{status}</p>
            )}

            <ActivityPanel problemId={current.id} onActivity={() => fetchProblem(current.id)} />
          </>
        )}
      </div>
    </div>
  );
}
