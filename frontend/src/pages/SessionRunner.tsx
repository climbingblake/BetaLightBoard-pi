import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/api";
import type { WorkoutSession, SessionItem, Led } from "@/api";
import { BoardGrid } from "@/components/BoardGrid";

export default function SessionRunner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [rows, setRows] = useState(10);
  const [cols, setCols] = useState(20);
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [sent, setSent] = useState<Record<number, boolean>>({});
  const [preview, setPreview] = useState<Led[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.sessions.get(Number(id)).then(setSession);
    api.settings.list().then((s) => {
      const r = s.find((x) => x.key === "NUMB_ROWS")?.value;
      const c = s.find((x) => x.key === "NUMB_COLS")?.value;
      if (r) setRows(Number(r));
      if (c) setCols(Number(c));
    });
  }, [id]);

  const item: SessionItem | undefined = session?.items[index];

  // Load the current item onto the physical board + build an on-screen preview.
  useEffect(() => {
    if (!item || finished) return;
    let cancelled = false;
    (async () => {
      if (item.kind === "problem") {
        await api.problems.load(item.ref_id);
        const p = await api.problems.get(item.ref_id);
        if (!cancelled) setPreview(p.leds);
      } else {
        await api.routes.play(item.ref_id, false);
        const r = await api.routes.get(item.ref_id);
        if (!cancelled) {
          setPreview(r.holds.map((h) => ({ id: h.id, row: h.row, col: h.col, rgb: "orange" })));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [item?.id, finished]);

  function targetParams(it: SessionItem) {
    return it.kind === "problem" ? { problem_id: it.ref_id } : { route_id: it.ref_id };
  }

  async function stopBoard() {
    await api.routines.stop().catch(() => {});
  }

  function advance() {
    if (!session) return;
    if (index + 1 >= session.items.length) {
      stopBoard();
      setFinished(true);
    } else {
      setIndex(index + 1);
    }
  }

  async function logAttempt() {
    if (!item) return;
    setBusy(true);
    try { await api.attempts.log(targetParams(item)); } finally { setBusy(false); }
  }

  async function logSend() {
    if (!item) return;
    setBusy(true);
    try {
      await api.sends.log(targetParams(item));
      setSent((s) => ({ ...s, [item.id]: true }));
      advance();
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <div className="p-6 text-slate-500">Loading...</div>;
  if (session.items.length === 0) return <div className="p-6 text-slate-500">This session has no items.</div>;

  if (finished) {
    const sentItems = session.items.filter((i) => sent[i.id]);
    return (
      <div className="max-w-md mx-auto p-6 mt-12 text-center">
        <h1 className="text-2xl font-semibold text-slate-100 mb-2">Session complete</h1>
        <p className="text-slate-500 text-sm mb-6">{session.name}</p>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 mb-6 text-left">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
            Sent {sentItems.length} of {session.items.length}
          </p>
          {sentItems.length === 0 ? (
            <p className="text-slate-600 text-sm">No sends logged this run.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {sentItems.map((i) => (
                <li key={i.id} className="text-sm text-green-400 flex items-center gap-2">
                  <span>✓</span><span>{i.name}</span>
                  <span className="text-xs text-slate-600">({i.kind})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => { setIndex(0); setSent({}); setFinished(false); }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-sm transition-colors"
          >
            Run again
          </button>
          <button
            onClick={() => navigate("/sessions")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-49px)]">
      {/* Board preview */}
      <div className="flex-1 bg-slate-950 overflow-hidden">
        <BoardGrid rows={rows} cols={cols} leds={preview} onCellClick={() => {}} readOnly />
      </div>

      {/* Controls */}
      <div className="w-72 border-l border-slate-800 bg-slate-900 flex flex-col gap-5 p-5">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{session.name}</p>
          <div className="text-xs text-slate-500 mb-3">Item {index + 1} of {session.items.length}</div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-4">
            <div className="h-full bg-orange-500 transition-all" style={{ width: `${((index + 1) / session.items.length) * 100}%` }} />
          </div>
          {item && (
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs px-2 py-0.5 rounded ${item.kind === "problem" ? "bg-blue-900/40 text-blue-300" : "bg-orange-900/40 text-orange-300"}`}>
                {item.kind}
              </span>
              {item.grade && <span className="text-xs text-slate-500">{item.grade}</span>}
            </div>
          )}
          <h2 className="text-slate-100 font-semibold text-lg leading-tight">{item?.name}</h2>
          <p className="text-xs text-slate-600 mt-1">{item?.holds} holds</p>
        </div>

        <hr className="border-slate-800" />

        <div className="flex flex-col gap-2 mt-auto">
          <button
            onClick={logSend}
            disabled={busy}
            className="w-full py-2.5 bg-green-700 hover:bg-green-600 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            ✓ Log Send & Next
          </button>
          <button
            onClick={logAttempt}
            disabled={busy}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm transition-colors disabled:opacity-50"
          >
            + Log Attempt
          </button>
          <button
            onClick={advance}
            disabled={busy}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm transition-colors disabled:opacity-50"
          >
            {index + 1 >= session.items.length ? "Finish →" : "Skip / Next →"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setIndex(Math.max(0, index - 1))}
              disabled={index === 0 || busy}
              className="flex-1 py-2 text-slate-600 hover:text-slate-400 rounded text-sm transition-colors disabled:opacity-30"
            >
              ← Previous
            </button>
            <button
              onClick={() => { stopBoard(); navigate("/sessions"); }}
              className="flex-1 py-2 text-slate-600 hover:text-slate-400 rounded text-sm transition-colors"
            >
              Quit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
