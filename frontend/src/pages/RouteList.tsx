import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api";
import type { Route, SortKey } from "@/api";
import { RatingDisplay } from "@/components/RatingStars";
import { fmtSendRate, fmtRelative } from "@/lib/format";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "created_desc", label: "Newest" },
  { value: "created_asc", label: "Oldest" },
  { value: "rating_desc", label: "Top rated" },
  { value: "ascents_desc", label: "Most ascents" },
  { value: "send_rate_desc", label: "Highest send rate" },
];

export default function RouteList() {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("created_desc");

  useEffect(() => {
    setLoading(true);
    api.routes.list({ q: q || undefined, sort }).then((r) => { setRoutes(r); setLoading(false); });
  }, [q, sort]);

  async function handleCreate() {
    setCreating(true);
    const r = await api.routes.create({ name: "New Route", duration: 3.0, number_shown: 3, repeat: false });
    navigate(`/routes/${r.id}/edit`);
  }

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

      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">Search</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name…"
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">Sort</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-1.5 text-sm"
          >
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm">Loading...</p>
      ) : routes.length === 0 ? (
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
                <div className="flex items-center gap-3">
                  <span className="text-slate-100 font-medium">{r.name || "Untitled"}</span>
                  <RatingDisplay avg={r.rating_avg} count={r.rating_count} />
                </div>
                <span className="text-slate-600 text-xs">
                  {r.holds.length} holds · {r.ascents} ascents · {fmtSendRate(r.send_rate)} send rate
                  {r.updated_at && ` · ${fmtRelative(r.updated_at)}`}
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
