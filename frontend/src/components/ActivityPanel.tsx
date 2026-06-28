import { useEffect, useState } from "react";
import { api } from "@/api";
import type { Attempt, Send, Favorite, WorkoutSession } from "@/api";
import { RatingInput } from "@/components/RatingStars";
import { useAuth } from "@/store/useAuth";
import { canEdit } from "@/lib/perms";

interface Props {
  problemId?: number;
  routeId?: number;
  /** Called after any activity change (send/attempt/rating) so parents can refresh aggregate stats. */
  onActivity?: () => void;
}

export function ActivityPanel({ problemId, routeId, onActivity }: Props) {
  const { user } = useAuth();
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [sends, setSends] = useState<Send[]>([]);
  const [favorite, setFavorite] = useState<Favorite | null>(null);
  const [myStars, setMyStars] = useState<number | null>(null);
  const [attemptNote, setAttemptNote] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [logginAttempt, setLoggingAttempt] = useState(false);
  const [loggingSend, setLoggingSend] = useState(false);
  const [showSendForm, setShowSendForm] = useState(false);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [sessionSel, setSessionSel] = useState("");
  const [addingToSession, setAddingToSession] = useState(false);
  const [sessionMsg, setSessionMsg] = useState("");

  const params = problemId ? { problem_id: problemId } : { route_id: routeId };
  const canRate = attempts.length > 0 || sends.length > 0;
  // Sessions the user is allowed to add to (their own, or any if admin).
  const mySessions = sessions.filter((s) => canEdit(user, s.created_by));

  useEffect(() => {
    if (!problemId && !routeId) return;
    api.attempts.list(params).then(setAttempts).catch(() => {});
    api.sends.list(params).then(setSends).catch(() => {});
    api.ratings.get(params).then((r) => setMyStars(r ? r.stars : null)).catch(() => {});
    api.sessions.list().then(setSessions).catch(() => {});
    api.favorites.list(problemId ? "problem" : "route")
      .then((favs) => {
        const match = favs.find((f) =>
          problemId ? f.problem_id === problemId : f.route_id === routeId
        );
        setFavorite(match ?? null);
      })
      .catch(() => {});
  }, [problemId, routeId]);

  async function addToSession() {
    if (!sessionSel) return;
    setAddingToSession(true);
    try {
      if (sessionSel === "__new__") {
        const s = await api.sessions.create({ name: "New Session" });
        await api.sessions.addItem(s.id, params);
        setSessions((prev) => [s, ...prev]);
        setSessionMsg(`Added to "${s.name}"`);
      } else {
        const target = sessions.find((s) => String(s.id) === sessionSel);
        await api.sessions.addItem(Number(sessionSel), params);
        setSessionMsg(`Added to "${target?.name ?? "session"}"`);
      }
      setSessionSel("");
      setTimeout(() => setSessionMsg(""), 2500);
    } catch {
      setSessionMsg("Could not add");
    } finally {
      setAddingToSession(false);
    }
  }

  async function setRating(stars: number) {
    await api.ratings.set({ ...params, stars });
    setMyStars(stars);
    onActivity?.();
  }

  async function logAttempt() {
    setLoggingAttempt(true);
    try {
      const a = await api.attempts.log({ ...params, notes: attemptNote || undefined });
      setAttempts((prev) => [a, ...prev]);
      setAttemptNote("");
      onActivity?.();
    } finally {
      setLoggingAttempt(false);
    }
  }

  async function clearAttempts() {
    if (!confirm("Clear all your attempts for this?")) return;
    await api.attempts.clear(params);
    setAttempts([]);
    onActivity?.();
  }

  async function logSend() {
    setLoggingSend(true);
    try {
      const s = await api.sends.log({ ...params, notes: sendNote || undefined });
      setSends((prev) => [s, ...prev]);
      // A send also records an attempt server-side; reflect that locally.
      api.attempts.list(params).then(setAttempts).catch(() => {});
      setSendNote("");
      setShowSendForm(false);
      onActivity?.();
    } finally {
      setLoggingSend(false);
    }
  }

  async function deleteSend(id: number) {
    await api.sends.delete(id);
    setSends((prev) => prev.filter((s) => s.id !== id));
    onActivity?.();
  }

  async function toggleFavorite() {
    if (favorite) {
      await api.favorites.remove(favorite.id);
      setFavorite(null);
    } else {
      const f = await api.favorites.add(params);
      setFavorite(f);
    }
  }

  function formatDate(ts: string) {
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return (
    <>


      {/* Favorite */}
      <button
        onClick={toggleFavorite}
        className={`w-full py-2 rounded text-sm transition-colors flex items-center justify-center gap-2 ${
          favorite
            ? "bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30"
            : "bg-slate-800 hover:bg-slate-700 text-slate-400"
        }`}
      >
        <span>{favorite ? "★" : "☆"}</span>
        <span>{favorite ? "Favorited" : "Add to Favorites"}</span>
      </button>

      <hr className="border-slate-800" />

      {/* Add to a session (workout) */}
      <div>
        <span className="text-xs text-slate-500 uppercase tracking-wider block mb-2">Add to Session</span>
        <div className="flex gap-1.5">
          <select
            value={sessionSel}
            onChange={(e) => setSessionSel(e.target.value)}
            className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1.5 text-xs"
          >
            <option value="">Choose a session…</option>
            {mySessions.map((s) => (
              <option key={s.id} value={s.id}>{s.name || "Untitled"}</option>
            ))}
            <option value="__new__">+ New session</option>
          </select>
          <button
            onClick={addToSession}
            disabled={!sessionSel || addingToSession}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors disabled:opacity-40"
          >
            {addingToSession ? "…" : "Add"}
          </button>
        </div>
        {sessionMsg && <p className="text-xs text-green-500 mt-1.5">{sessionMsg}</p>}
      </div>

      <hr className="border-slate-800" />

      {/* Rating */}
      <div>
        <span className="text-xs text-slate-500 uppercase tracking-wider block mb-2">Your Rating</span>
        {canRate ? (
          <RatingInput value={myStars} onChange={setRating} />
        ) : (
          <p className="text-xs text-slate-600">Log an attempt or send to rate.</p>
        )}
      </div>

      <hr className="border-slate-800" />

      {/* Attempts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500 uppercase tracking-wider">
            Attempts ({attempts.length})
          </span>
          {attempts.length > 0 && (
            <button onClick={clearAttempts} className="text-xs text-slate-600 hover:text-red-400 transition-colors">
              Clear
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1.5 mb-2">
          <input
            type="text"
            value={attemptNote}
            onChange={(e) => setAttemptNote(e.target.value)}
            placeholder="Note (optional)"
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1.5 text-xs w-full"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); logAttempt(); } }}
          />
          <button
            onClick={logAttempt}
            disabled={logginAttempt}
            className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors disabled:opacity-50"
          >
            {logginAttempt ? "Logging…" : "+ Log Attempt"}
          </button>
        </div>
        {attempts.slice(0, 5).map((a) => (
          <div key={a.id} className="text-xs text-slate-600 flex justify-between py-0.5">
            <span>{a.notes || "attempt"}</span>
            <span>{formatDate(a.timestamp)}</span>
          </div>
        ))}
        {attempts.length > 5 && (
          <p className="text-xs text-slate-700 mt-1">{attempts.length - 5} more…</p>
        )}
      </div>

      <hr className="border-slate-800" />

      {/* Sends */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500 uppercase tracking-wider">
            Sends ({sends.length})
          </span>
          <button
            onClick={() => setShowSendForm((s) => !s)}
            className="text-xs text-green-600 hover:text-green-400 transition-colors"
          >
            + Send
          </button>
        </div>
        {showSendForm && (
          <div className="flex flex-col gap-1.5 mb-2">
            <input
              type="text"
              value={sendNote}
              onChange={(e) => setSendNote(e.target.value)}
              placeholder="Note (optional)"
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1.5 text-xs w-full"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); logSend(); } }}
              autoFocus
            />
            <button
              onClick={logSend}
              disabled={loggingSend}
              className="w-full py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-xs transition-colors disabled:opacity-50"
            >
              {loggingSend ? "Saving…" : "Record Send"}
            </button>
          </div>
        )}
        {sends.map((s) => (
          <div key={s.id} className="text-xs text-green-700 flex justify-between items-center py-0.5 group">
            <span className="text-green-500">{s.notes || "sent"}</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-600">{formatDate(s.timestamp)}</span>
              <button
                onClick={() => deleteSend(s.id)}
                className="text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
