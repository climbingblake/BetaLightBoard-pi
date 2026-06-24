import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProblemStore } from "@/store/useProblemStore";
import { BoardGrid } from "@/components/BoardGrid";
import { ColorPicker } from "@/components/ColorPicker";
import { api } from "@/api";
import type { Led } from "@/api";

const GRADES = ["V0","V1","V2","V3","V4","V5","V6","V7","V8","V9","V10","V11","V12"];

export default function ProblemEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { current, loading, fetchProblem, updateProblem, addLed, updateLed, deleteLed, loadToBoard, clearBoard } =
    useProblemStore();

  const [selectedColor, setSelectedColor] = useState("blue");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [setter, setSetter] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState(10);
  const [cols, setCols] = useState(10);

  useEffect(() => {
    if (id && id !== "new") fetchProblem(Number(id));
    api.settings.list().then((settings) => {
      const r = settings.find((s) => s.key === "NUMB_ROWS")?.value;
      const c = settings.find((s) => s.key === "NUMB_COLS")?.value;
      if (r) setRows(Number(r));
      if (c) setCols(Number(c));
    });
  }, [id]);

  useEffect(() => {
    if (current) {
      setName(current.name ?? "");
      setGrade(current.grade ?? "");
      setSetter(current.setter ?? "");
    }
  }, [current]);

  async function handleCellClick(row: number, col: number, existing: Led | undefined) {
    if (!current) return;

    if (existing) {
      // Toggle off if clicking the same color, otherwise recolor
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
    await updateProblem(current.id, { name, grade, setter });
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

  if (loading) return <div className="p-6 text-slate-500">Loading...</div>;
  if (!current) return <div className="p-6 text-slate-500">Problem not found.</div>;

  return (
    <div className="flex h-[calc(100vh-49px)]">
      {/* Board */}
      <div className="flex-1 flex items-center justify-center bg-slate-950 overflow-hidden">
        <BoardGrid
          rows={rows}
          cols={cols}
          leds={current.leds}
          selectedColor={selectedColor}
          onCellClick={handleCellClick}
        />
      </div>

      {/* Sidebar */}
      <div className="w-64 border-l border-slate-800 bg-slate-900 flex flex-col gap-5 p-5 overflow-y-auto">
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
              <input
                value={setter}
                onChange={(e) => setSetter(e.target.value)}
                placeholder="Setter"
                className="bg-slate-800 border border-slate-700 text-slate-100 rounded px-3 py-2 text-sm w-full"
              />
              <div className="flex gap-2">
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
            </div>
          ) : (
            <div
              className="cursor-pointer group"
              onClick={() => setEditing(true)}
            >
              <div className="flex items-start justify-between">
                <h2 className="text-slate-100 font-semibold text-lg leading-tight">
                  {current.name || "Untitled"}
                </h2>
                <span className="text-xs text-slate-600 group-hover:text-slate-400 ml-2 mt-1">edit</span>
              </div>
              {current.grade && (
                <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                  {current.grade}
                </span>
              )}
              {current.setter && (
                <p className="text-xs text-slate-600 mt-1">by {current.setter}</p>
              )}
            </div>
          )}
        </div>

        <hr className="border-slate-800" />

        {/* Color picker */}
        <ColorPicker selected={selectedColor} onChange={setSelectedColor} />

        <div className="text-xs text-slate-600">
          {current.leds.length} holds placed
        </div>

        <hr className="border-slate-800" />

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleLoad}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-sm transition-colors"
          >
            Load to Board
          </button>
          <button
            onClick={handleClear}
            className="w-full py-2 hover:bg-red-900/30 text-slate-500 hover:text-red-400 rounded text-sm transition-colors"
          >
            Clear All
          </button>
          <button
            onClick={() => navigate("/")}
            className="w-full py-2 text-slate-600 hover:text-slate-400 rounded text-sm transition-colors"
          >
            ← Back
          </button>
        </div>

        {status && (
          <p className="text-xs text-green-500 text-center">{status}</p>
        )}
      </div>
    </div>
  );
}
