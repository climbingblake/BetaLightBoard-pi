import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProblemStore } from "@/store/useProblemStore";

const GRADES = ["ALL", "V0","V1","V2","V3","V4","V5","V6","V7","V8","V9","V10","V11","V12"];

export default function ProblemList() {
  const { problems, loading, fetchProblems, deleteProblem, loadToBoard } = useProblemStore();
  const [grade, setGrade] = useState("ALL");
  const [setter, setSetter] = useState("ALL");
  const navigate = useNavigate();

  useEffect(() => {
    fetchProblems({
      grade: grade !== "ALL" ? grade : undefined,
      setter: setter !== "ALL" ? setter : undefined,
    });
  }, [grade, setter]);

  const setters = ["ALL", ...Array.from(new Set(problems.map((p) => p.setter ?? "").filter(Boolean)))];

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (confirm("Delete this problem?")) {
      await deleteProblem(id);
    }
  }

  async function handleLoad(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    await loadToBoard(id);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Problems</h1>
        <button
          onClick={() => navigate("/problems/new")}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors"
        >
          + New Problem
        </button>
      </div>

      <div className="flex gap-4 mb-6">
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">Grade</label>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-1.5 text-sm"
          >
            {GRADES.map((g) => <option key={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">Setter</label>
          <select
            value={setter}
            onChange={(e) => setSetter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-1.5 text-sm"
          >
            {setters.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {loading && <p className="text-slate-500">Loading...</p>}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {problems.map((p) => (
          <div
            key={p.id}
            onClick={() => navigate(`/problems/${p.id}`)}
            className="bg-slate-900 border border-slate-800 rounded-lg p-4 cursor-pointer hover:border-slate-600 transition-colors"
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-slate-100 font-medium truncate">{p.name || "Untitled"}</span>
              {p.grade && (
                <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded ml-2 shrink-0">
                  {p.grade}
                </span>
              )}
            </div>
            {p.setter && (
              <p className="text-xs text-slate-500 mb-3">by {p.setter}</p>
            )}
            <div className="flex items-center gap-1 text-xs text-slate-600 mb-3">
              <span>{p.leds.length} holds</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={(e) => handleLoad(p.id, e)}
                className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
              >
                Load
              </button>
              <button
                onClick={(e) => handleDelete(p.id, e)}
                className="py-1 px-2 hover:bg-red-900/40 text-slate-500 hover:text-red-400 rounded text-xs transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {!loading && problems.length === 0 && (
        <p className="text-slate-600 text-center mt-16">
          No problems yet. Create one or generate a random layout.
        </p>
      )}
    </div>
  );
}
