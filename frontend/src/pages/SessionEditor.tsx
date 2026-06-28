import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/api";
import type { WorkoutSession, Problem, Route } from "@/api";
import { useAuth } from "@/store/useAuth";

export default function SessionEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const [addKind, setAddKind] = useState<"problem" | "route">("problem");
  const [addId, setAddId] = useState<string>("");
  const dragIndex = useRef<number | null>(null);

  useEffect(() => {
    if (!id) return;
    api.sessions.get(Number(id)).then((s) => {
      setSession(s);
      setName(s.name);
      setDescription(s.description ?? "");
    });
    api.problems.list().then(setProblems);
    api.routes.list().then(setRoutes);
  }, [id]);

  if (user && !user.is_admin) {
    return <div className="p-6 text-slate-500">Only admins can edit sessions.</div>;
  }
  if (!session) return <div className="p-6 text-slate-500">Loading...</div>;

  async function saveMeta() {
    if (!session) return;
    const s = await api.sessions.update(session.id, { name, description: description || undefined });
    setSession(s);
    setSavedMsg("Saved");
    setTimeout(() => setSavedMsg(""), 1500);
  }

  async function addItem() {
    if (!session || !addId) return;
    const body = addKind === "problem" ? { problem_id: Number(addId) } : { route_id: Number(addId) };
    setSession(await api.sessions.addItem(session.id, body));
    setAddId("");
  }

  async function removeItem(itemId: number) {
    if (!session) return;
    setSession(await api.sessions.removeItem(session.id, itemId));
  }

  async function onDrop(targetIndex: number) {
    if (!session || dragIndex.current === null || dragIndex.current === targetIndex) return;
    const ids = session.items.map((i) => i.id);
    const [moved] = ids.splice(dragIndex.current, 1);
    ids.splice(targetIndex, 0, moved);
    dragIndex.current = null;
    setSession(await api.sessions.reorder(session.id, ids));
  }

  const options = addKind === "problem" ? problems : routes;

  return (
    <div className="max-w-2xl mx-auto p-6 mt-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Edit Session</h1>
        <button onClick={() => navigate("/sessions")} className="text-sm text-slate-500 hover:text-slate-300">← Back</button>
      </div>

      {/* Meta */}
      <div className="flex flex-col gap-3 mb-6 bg-slate-900 border border-slate-800 rounded-lg p-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Session name"
          className="bg-slate-800 border border-slate-700 text-slate-100 rounded px-3 py-2 text-sm"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-3">
          <button onClick={saveMeta} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors">Save</button>
          {savedMsg && <span className="text-xs text-green-500">{savedMsg}</span>}
        </div>
      </div>

      {/* Add item */}
      <div className="flex gap-2 mb-4">
        <select
          value={addKind}
          onChange={(e) => { setAddKind(e.target.value as "problem" | "route"); setAddId(""); }}
          className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-2 text-sm"
        >
          <option value="problem">Problem</option>
          <option value="route">Route</option>
        </select>
        <select
          value={addId}
          onChange={(e) => setAddId(e.target.value)}
          className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-2 text-sm"
        >
          <option value="">Select a {addKind}…</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name || "Untitled"}</option>)}
        </select>
        <button
          onClick={addItem}
          disabled={!addId}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-sm transition-colors disabled:opacity-40"
        >
          + Add
        </button>
      </div>

      {/* Items (drag to reorder) */}
      {session.items.length === 0 ? (
        <p className="text-slate-500 text-sm">No items yet. Add problems or routes above.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {session.items.map((item, idx) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => { dragIndex.current = idx; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(idx)}
              className="flex items-center gap-3 px-4 py-3 bg-slate-900 border border-slate-800 rounded-lg cursor-move hover:border-slate-700 transition-colors"
            >
              <span className="text-slate-600 select-none">⠿</span>
              <span className="text-slate-600 text-xs w-5">{idx + 1}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${item.kind === "problem" ? "bg-blue-900/40 text-blue-300" : "bg-orange-900/40 text-orange-300"}`}>
                {item.kind}
              </span>
              <span className="text-slate-100 text-sm flex-1">{item.name}</span>
              {item.grade && <span className="text-xs text-slate-500">{item.grade}</span>}
              <span className="text-xs text-slate-600">{item.holds} holds</span>
              <button
                onClick={() => removeItem(item.id)}
                className="text-slate-600 hover:text-red-400 text-sm transition-colors"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
