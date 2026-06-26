import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api";
import type { Route } from "@/api";

export default function RouteList() {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.routes.list().then((r) => { setRoutes(r); setLoading(false); });
  }, []);

  async function handleCreate() {
    setCreating(true);
    const r = await api.routes.create({ name: "New Route", duration: 3.0, number_shown: 3, repeat: false });
    navigate(`/routes/${r.id}/edit`);
  }

  if (loading) return <div className="p-6 text-slate-500">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto p-6 mt-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Routes</h1>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
        >
          {creating ? "Creating…" : "+ New Route"}
        </button>
      </div>

      {routes.length === 0 ? (
        <p className="text-slate-500 text-sm">No routes yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {routes.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between px-4 py-3 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 cursor-pointer transition-colors"
              onClick={() => navigate(`/routes/${r.id}`)}
            >
              <div>
                <span className="text-slate-100 font-medium">{r.name || "Untitled"}</span>
                <span className="text-slate-600 text-xs ml-3">
                  {r.holds.length} holds · {r.duration}s · {r.number_shown} shown
                  {r.repeat && " · repeat"}
                </span>
              </div>
              <span className="text-slate-600 text-xs">▶</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
