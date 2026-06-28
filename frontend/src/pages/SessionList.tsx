import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api";
import type { WorkoutSession, SessionSortKey } from "@/api";
import { useAuth } from "@/store/useAuth";
import { canEdit } from "@/lib/perms";
import { RatingDisplay } from "@/components/RatingStars";

const SORTS: { value: SessionSortKey; label: string }[] = [
  { value: "created_desc", label: "Newest" },
  { value: "created_asc", label: "Oldest" },
  { value: "rating_desc", label: "Top rated" },
  { value: "name_asc", label: "Name" },
];

const VISIBILITY = [
  { value: "all", label: "All" },
  { value: "public", label: "Public" },
  { value: "private", label: "Private" },
];

const MIN_STARS = [
  { value: "0", label: "Any" },
  { value: "1", label: "1★ +" },
  { value: "2", label: "2★ +" },
  { value: "3", label: "3★" },
];

export default function SessionList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [creators, setCreators] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [visibility, setVisibility] = useState("all");
  const [creator, setCreator] = useState("ALL");
  const [minStars, setMinStars] = useState("0");
  const [sort, setSort] = useState<SessionSortKey>("created_desc");

  function refresh() {
    api.sessions
      .list({
        public: visibility === "all" ? undefined : visibility === "public",
        created_by: creator !== "ALL" ? Number(creator) : undefined,
        min_stars: minStars !== "0" ? Number(minStars) : undefined,
        sort,
      })
      .then((s) => {
        setSessions(s);
        setLoading(false);
      });
  }
  useEffect(refresh, [visibility, creator, minStars, sort]);

  // Build the creator dropdown from the full (unfiltered) set, once.
  useEffect(() => {
    api.sessions.list().then((all) => {
      const seen = new Map<number, string>();
      for (const s of all) {
        if (s.created_by != null && !seen.has(s.created_by)) {
          seen.set(s.created_by, s.creator_name || `User ${s.created_by}`);
        }
      }
      setCreators(Array.from(seen, ([id, name]) => ({ id, name })));
    });
  }, []);

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

  const selectCls = "bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-1.5 text-sm";
  const labelCls = "text-xs text-slate-500 uppercase tracking-wider block mb-1";

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

      <div className="flex flex-wrap gap-4 mb-6">
        <div>
          <label className={labelCls}>Visibility</label>
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className={selectCls}>
            {VISIBILITY.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Creator</label>
          <select value={creator} onChange={(e) => setCreator(e.target.value)} className={selectCls}>
            <option value="ALL">Anyone</option>
            {creators.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id === user?.id ? `${c.name} (you)` : c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Rating</label>
          <select value={minStars} onChange={(e) => setMinStars(e.target.value)} className={selectCls}>
            {MIN_STARS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Sort</label>
          <select value={sort} onChange={(e) => setSort(e.target.value as SessionSortKey)} className={selectCls}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-slate-500">Loading...</div>
      ) : sessions.length === 0 ? (
        <p className="text-slate-500 text-sm">No sessions match these filters.</p>
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
                  <div className="flex items-center gap-2 mt-0.5">
                    <RatingDisplay avg={s.rating_avg} count={s.rating_count} />
                    <span className="text-slate-600 text-xs">
                      · {s.item_count} items · {mine ? "yours" : s.creator_name || "—"}
                    </span>
                  </div>
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
