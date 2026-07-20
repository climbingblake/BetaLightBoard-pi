import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useProblemStore } from "@/store/useProblemStore";
import { RatingDisplay } from "@/components/RatingStars";
import { fmtSendRate, fmtRelative } from "@/lib/format";
import { api } from "@/api";
import type { SortKey } from "@/api";

const GRADE_OPTIONS = ["V0","V1","V2","V3","V4","V5","V6","V7","V8","V9","V10","V11","V12"];

const RATING_OPTIONS: { key: string; label: string; test: (r: number | null) => boolean }[] = [
  { key: "0",   label: "0 ★",   test: (r) => r == null || r === 0 },
  { key: "1",   label: "≥ 1 ★", test: (r) => r != null && r >= 1 },
  { key: "2",   label: "≥ 2 ★", test: (r) => r != null && r >= 2 },
  { key: "3",   label: "≥ 3 ★", test: (r) => r != null && r >= 3 },
];

const ASCENT_OPTIONS: { key: string; label: string; test: (a: number) => boolean }[] = [
  { key: "0",    label: "0",      test: (a) => a === 0 },
  { key: "gt0",  label: "> 0",    test: (a) => a > 0 },
  { key: "gte5", label: "≥ 5",    test: (a) => a >= 5 },
  { key: "gte10",label: "≥ 10",   test: (a) => a >= 10 },
  { key: "gte25",label: "≥ 25",   test: (a) => a >= 25 },
  { key: "gte50",label: "≥ 50",   test: (a) => a >= 50 },
  { key: "gte100",label: "≥ 100", test: (a) => a >= 100 },
];

const SORTS: { value: SortKey; label: string }[] = [
  { value: "created_desc", label: "Newest" },
  { value: "created_asc", label: "Oldest" },
  { value: "rating_desc", label: "Top rated" },
  { value: "ascents_desc", label: "Most ascents" },
  { value: "send_rate_desc", label: "Highest send rate" },
];

function GradeCheckboxDropdown({
  selected,
  onChange,
}: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggle(grade: string) {
    const next = new Set(selected);
    if (next.has(grade)) next.delete(grade);
    else next.add(grade);
    onChange(next);
  }

  const label =
    selected.size === 0
      ? "ALL"
      : [...GRADE_OPTIONS].filter((g) => selected.has(g)).join(", ");

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-1.5 text-sm flex items-center gap-2 min-w-[80px]"
      >
        <span className="truncate max-w-[160px]">{label}</span>
        <span className="text-slate-500 ml-auto">▾</span>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-slate-800 border border-slate-700 rounded shadow-lg p-2 min-w-[120px]">
          <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-700 cursor-pointer text-sm text-slate-300">
            <input
              type="checkbox"
              checked={selected.size === 0}
              onChange={() => onChange(new Set())}
              className="accent-blue-500"
            />
            ALL
          </label>
          <div className="border-t border-slate-700 my-1" />
          {GRADE_OPTIONS.map((g) => (
            <label key={g} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-700 cursor-pointer text-sm text-slate-300">
              <input
                type="checkbox"
                checked={selected.has(g)}
                onChange={() => toggle(g)}
                className="accent-blue-500"
              />
              {g}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function RatingCheckboxDropdown({
  selected,
  onChange,
}: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  }

  const label =
    selected.size === 0
      ? "ALL"
      : RATING_OPTIONS.filter((o) => selected.has(o.key)).map((o) => o.label).join(", ");

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-1.5 text-sm flex items-center gap-2 min-w-[80px]"
      >
        <span className="truncate max-w-[160px]">{label}</span>
        <span className="text-slate-500 ml-auto">▾</span>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-slate-800 border border-slate-700 rounded shadow-lg p-2 min-w-[120px]">
          <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-700 cursor-pointer text-sm text-slate-300">
            <input
              type="checkbox"
              checked={selected.size === 0}
              onChange={() => onChange(new Set())}
              className="accent-blue-500"
            />
            ALL
          </label>
          <div className="border-t border-slate-700 my-1" />
          {RATING_OPTIONS.map((o) => (
            <label key={o.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-700 cursor-pointer text-sm text-slate-300">
              <input
                type="checkbox"
                checked={selected.has(o.key)}
                onChange={() => toggle(o.key)}
                className="accent-blue-500"
              />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function AscentsCheckboxDropdown({
  selected,
  onChange,
}: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  }

  const label =
    selected.size === 0
      ? "ALL"
      : ASCENT_OPTIONS.filter((o) => selected.has(o.key)).map((o) => o.label).join(", ");

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-1.5 text-sm flex items-center gap-2 min-w-[80px]"
      >
        <span className="truncate max-w-[160px]">{label}</span>
        <span className="text-slate-500 ml-auto">▾</span>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-slate-800 border border-slate-700 rounded shadow-lg p-2 min-w-[120px]">
          <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-700 cursor-pointer text-sm text-slate-300">
            <input
              type="checkbox"
              checked={selected.size === 0}
              onChange={() => onChange(new Set())}
              className="accent-blue-500"
            />
            ALL
          </label>
          <div className="border-t border-slate-700 my-1" />
          {ASCENT_OPTIONS.map((o) => (
            <label key={o.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-700 cursor-pointer text-sm text-slate-300">
              <input
                type="checkbox"
                checked={selected.has(o.key)}
                onChange={() => toggle(o.key)}
                className="accent-blue-500"
              />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProblemList() {
  const { problems, loading, fetchProblems, loadToBoard, setVisibleProblems } = useProblemStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [favIds, setFavIds] = useState<Set<number>>(new Set());
  const [favItemIds, setFavItemIds] = useState<Map<number, number>>(new Map()); // problem_id → favorite.id
  const navigate = useNavigate();

  // All filter state lives in the URL — back button restores it for free
  const gradesKey = searchParams.get("grades") ?? "";
  const ratingsKey = searchParams.get("ratings") ?? "";
  const ascentsKey = searchParams.get("ascents") ?? "";
  const setter = searchParams.get("setter") ?? "ALL";
  const sort = (searchParams.get("sort") ?? "created_desc") as SortKey;
  const favoritesOnly = searchParams.get("fav") === "1";

  const selectedGrades = useMemo(() => new Set(gradesKey ? gradesKey.split(",") : []), [gradesKey]);
  const selectedRatings = useMemo(() => new Set(ratingsKey ? ratingsKey.split(",") : []), [ratingsKey]);
  const selectedAscents = useMemo(() => new Set(ascentsKey ? ascentsKey.split(",") : []), [ascentsKey]);

  function patch(updates: Record<string, string>) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(updates)) {
        if (!v) next.delete(k); else next.set(k, v);
      }
      return next;
    }, { replace: true });
  }

  useEffect(() => {
    fetchProblems({
      grades: gradesKey || undefined,
      setter: setter !== "ALL" ? setter : undefined,
      sort,
    });
  }, [gradesKey, setter, sort]);

  useEffect(() => {
    api.favorites.list("problem")
      .then((favs) => {
        const ids = new Set(favs.map((f) => f.problem_id!).filter((x) => x != null));
        const itemMap = new Map(favs.filter((f) => f.problem_id != null).map((f) => [f.problem_id!, f.id]));
        setFavIds(ids);
        setFavItemIds(itemMap);
      })
      .catch(() => {});
  }, []);

  async function toggleFav(problemId: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (favIds.has(problemId)) {
      const favId = favItemIds.get(problemId)!;
      await api.favorites.remove(favId);
      setFavIds((prev) => { const s = new Set(prev); s.delete(problemId); return s; });
      setFavItemIds((prev) => { const m = new Map(prev); m.delete(problemId); return m; });
    } else {
      const fav = await api.favorites.add({ problem_id: problemId });
      setFavIds((prev) => new Set(prev).add(problemId));
      setFavItemIds((prev) => new Map(prev).set(problemId, fav.id));
    }
  }

  useEffect(() => {
    const ratingTests = RATING_OPTIONS.filter((o) => selectedRatings.has(o.key));
    const ascentTests = ASCENT_OPTIONS.filter((o) => selectedAscents.has(o.key));
    const byFav = favoritesOnly ? problems.filter((p) => favIds.has(p.id)) : problems;
    const byRating = ratingTests.length === 0
      ? byFav
      : byFav.filter((p) => ratingTests.some((o) => o.test(p.rating_avg)));
    const computed = ascentTests.length === 0
      ? byRating
      : byRating.filter((p) => ascentTests.some((o) => o.test(p.ascents ?? 0)));
    setVisibleProblems(computed);
  }, [ratingsKey, ascentsKey, favoritesOnly, problems, favIds]);

  const setters = ["ALL", ...Array.from(new Set(problems.map((p) => p.setter ?? "").filter(Boolean)))];
  const activeRatingTests = RATING_OPTIONS.filter((o) => selectedRatings.has(o.key));
  const activeAscentTests = ASCENT_OPTIONS.filter((o) => selectedAscents.has(o.key));
  const byFav = favoritesOnly ? problems.filter((p) => favIds.has(p.id)) : problems;
  const byRating = activeRatingTests.length === 0
    ? byFav
    : byFav.filter((p) => activeRatingTests.some((o) => o.test(p.rating_avg)));
  const visible = activeAscentTests.length === 0
    ? byRating
    : byRating.filter((p) => activeAscentTests.some((o) => o.test(p.ascents ?? 0)));

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
          <GradeCheckboxDropdown
            selected={selectedGrades}
            onChange={(next) => patch({ grades: [...GRADE_OPTIONS].filter((g) => next.has(g)).join(",") })}
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">Rating</label>
          <RatingCheckboxDropdown
            selected={selectedRatings}
            onChange={(next) => patch({ ratings: [...next].join(",") })}
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">Ascents</label>
          <AscentsCheckboxDropdown
            selected={selectedAscents}
            onChange={(next) => patch({ ascents: [...next].join(",") })}
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">Setter</label>
          <select
            value={setter}
            onChange={(e) => patch({ setter: e.target.value === "ALL" ? "" : e.target.value })}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-1.5 text-sm"
          >
            {setters.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">Sort</label>
          <select
            value={sort}
            onChange={(e) => patch({ sort: e.target.value === "created_desc" ? "" : e.target.value })}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-1.5 text-sm"
          >
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={() => patch({ fav: favoritesOnly ? "" : "1" })}
            className={`px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-1.5 border ${
              favoritesOnly
                ? "bg-yellow-600/20 border-yellow-700/50 text-yellow-400"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>{favoritesOnly ? "★" : "☆"}</span>
            <span>Favorites</span>
          </button>
        </div>
      </div>

      {loading && <p className="text-slate-500">Loading...</p>}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {visible.map((p) => (
          <div
            key={p.id}
            onClick={() => navigate(`/problems/${p.id}`)}
            className="bg-slate-900 border border-slate-800 rounded-lg p-4 cursor-pointer hover:border-slate-600 transition-colors"
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-slate-100 font-medium truncate">{p.name || "Untitled"}</span>
              <div className="flex items-center gap-1.5 ml-2 shrink-0">
                {p.grade && (
                  <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                    {p.grade}
                  </span>
                )}
                <button
                  onClick={(e) => toggleFav(p.id, e)}
                  className={`text-sm leading-none transition-colors ${favIds.has(p.id) ? "text-yellow-400" : "text-slate-600 hover:text-slate-400"}`}
                >
                  {favIds.has(p.id) ? "★" : "☆"}
                </button>
              </div>
            </div>
            {p.setter && (
              <p className="text-xs text-slate-500 mb-1">by {p.setter}</p>
            )}
            <div className="mb-2">
              <RatingDisplay avg={p.rating_avg} count={p.rating_count} />
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-600 mb-3 flex-wrap">
              <span>{p.leds.length} holds</span>
              <span>·</span>
              <span>{p.ascents} ascents</span>
              <span>·</span>
              <span title="send rate">{fmtSendRate(p.send_rate)}</span>
              {p.updated_at && (<><span>·</span><span>{fmtRelative(p.updated_at)}</span></>)}
            </div>
            <div className="flex gap-2">
              <button
                onClick={(e) => handleLoad(p.id, e)}
                className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
              >
                Load
              </button>
            </div>
          </div>
        ))}
      </div>

      {!loading && visible.length === 0 && (
        <p className="text-slate-600 text-center mt-16">
          {favoritesOnly
            ? "No favorited problems yet. Tap the star on a problem to add one."
            : "No problems yet. Create one or generate a random layout."}
        </p>
      )}
    </div>
  );
}
