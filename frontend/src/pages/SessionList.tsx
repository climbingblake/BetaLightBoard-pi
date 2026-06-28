import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api";
import type { WorkoutSession } from "@/api";
import { useAuth } from "@/store/useAuth";
import { canEdit } from "@/lib/perms";

export default function SessionList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  function refresh() {
    api.sessions.list().then((s) => { setSessions(s); setLoading(false); });
  }
  useEffect(refresh, []);

  async function handleCreate() {
    setCreating(true);
    const s = await api.sessions.create({ name: "New Session" });
    navigate(`/sessions/${s.id}/edit`);
  }

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this session?")) return;
    await api.sessions.delete(id);
    refresh();
  }

  async function toggleShare(s: WorkoutSession, e: React.MouseEvent) {
    e.stopPropagation();
    const updated = await api.sessions.setShared(s.id, !s.is_public);
    setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_public: updated.is_public } : x)));
  }

  if (loading) return <div className="p-6 text-slate-500">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto p-6 mt-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Sessions</h1>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
        >
          {creating ? "Creating…" : "+ New Session"}
        </button>
      </div>

      {sessions.length === 0 ? (
        <p className="text-slate-500 text-sm">No sessions yet. Create one to build a workout.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((s) => {
            const mine = s.created_by != null && s.created_by === user?.id;
            const editable = canEdit(user, s.created_by);
            return (
              <div
                key={s.id}
                className="flex items-center justify-between px-4 py-3 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-100 font-medium truncate">{s.name || "Untitled"}</span>
                    {s.is_public && (
                      <span className="text-xs bg-green-900/40 text-green-300 px-1.5 py-0.5 rounded shrink-0">Public</span>
                    )}
                    {!mine && !s.is_public && (
                      <span className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded shrink-0">shared</span>
                    )}
                  </div>
                  <span className="text-slate-600 text-xs">
                    {s.item_count} items{mine ? " · yours" : ""}
                  </span>
                  {s.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{s.description}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => navigate(`/sessions/${s.id}/run`)}
                    disabled={s.item_count === 0}
                    className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded text-xs font-medium transition-colors disabled:opacity-40"
                  >
                    ▶ Run
                  </button>
                  {isAdmin && (
                    <button
                      onClick={(e) => toggleShare(s, e)}
                      className={`px-3 py-1.5 rounded text-xs transition-colors ${
                        s.is_public
                          ? "bg-green-900/40 text-green-300 hover:bg-green-900/60"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      {s.is_public ? "Unshare" : "Share"}
                    </button>
                  )}
                  {editable && (
                    <>
                      <button
                        onClick={() => navigate(`/sessions/${s.id}/edit`)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => handleDelete(s.id, e)}
                        className="py-1.5 px-2 hover:bg-red-900/40 text-slate-500 hover:text-red-400 rounded text-xs transition-colors"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
