import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProblemStore } from "@/store/useProblemStore";

const GRADES = ["V0","V1","V2","V3","V4","V5","V6","V7","V8","V9","V10","V11","V12"];

export default function NewProblem() {
  const navigate = useNavigate();
  const { createProblem } = useProblemStore();

  const [name, setName] = useState("");
  const [grade, setGrade] = useState("V0");
  const [setter, setSetter] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const p = await createProblem({ name, grade, setter, description });
    navigate(`/problems/${p.id}`);
  }

  return (
    <div className="max-w-md mx-auto p-6 mt-8">
      <h1 className="text-2xl font-semibold text-slate-100 mb-6">New Problem</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Problem name"
            className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">Grade</label>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded px-3 py-2 text-sm"
          >
            {GRADES.map((g) => <option key={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">Setter</label>
          <input
            value={setter}
            onChange={(e) => setSetter(e.target.value)}
            placeholder="Your name"
            className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded px-3 py-2 text-sm resize-none"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create & Start Setting"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
