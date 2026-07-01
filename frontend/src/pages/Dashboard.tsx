import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api";
import type { DashboardData, PyramidData } from "@/api";
import { Sparkline, BarChart, StackedArea, PyramidBars } from "@/components/Charts";
import { RatingDisplay } from "@/components/RatingStars";
import { fmtSendRate, fmtRelative } from "@/lib/format";
import { useAuth } from "@/store/useAuth";

const ACCENT = {
  blue: "#60a5fa",
  orange: "#fb923c",
  violet: "#a78bfa",
  green: "#4ade80",
};

function StatCard({
  label, value, sub, spark, color, onClick,
}: {
  label: string; value: number; sub: string; spark: number[]; color: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-slate-900 border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-semibold text-slate-100 mt-1">{value.toLocaleString()}</p>
      <p className="text-xs text-slate-600 mt-0.5">{sub}</p>
      <div className="mt-2"><Sparkline data={spark} color={color} /></div>
    </button>
  );
}

function Card({ title, right, children, className = "" }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-lg ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [d, setD] = useState<DashboardData | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api.dashboard.get().then(setD).catch(() => setErr(true));
  }, []);

  if (err) return <div className="p-6 text-slate-500">Couldn’t load the dashboard.</div>;
  if (!d) return <div className="p-6 text-slate-500">Loading…</div>;

  const plus = (n: number) => `+${n} this week`;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-500">
          {user ? `Welcome back, ${user.username}.` : "Welcome back."} Here’s how the board is looking.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Problems" value={d.totals.problems} sub={plus(d.new_last_7.problems)} spark={d.sparklines.problems} color={ACCENT.blue} onClick={() => navigate("/problems")} />
        <StatCard label="Routes" value={d.totals.routes} sub={plus(d.new_last_7.routes)} spark={d.sparklines.routes} color={ACCENT.orange} onClick={() => navigate("/routes")} />
        <StatCard label="Sessions" value={d.totals.sessions} sub={plus(d.new_last_7.sessions)} spark={d.sparklines.sessions} color={ACCENT.violet} onClick={() => navigate("/sessions")} />
        <StatCard label="Sends" value={d.totals.sends} sub={plus(d.new_last_7.sends)} spark={d.sparklines.sends} color={ACCENT.green} />
      </div>

      {/* Grade distribution */}
      <Card title="Grade distribution" className="mb-4">
        <div className="flex flex-wrap gap-2 mb-4">
          <Pill label="Graded problems" value={d.grade_summary.total} color={ACCENT.blue} />
          <Pill label="Most common" value={d.grade_summary.most_common ?? "—"} color={ACCENT.violet} />
          <Pill label="Hardest" value={d.grade_summary.hardest ?? "—"} color={ACCENT.orange} />
        </div>
        {d.grade_distribution.length > 0 ? (
          <BarChart data={d.grade_distribution.map((g) => ({ label: g.grade, value: g.count }))} color={ACCENT.blue} />
        ) : (
          <p className="text-sm text-slate-600">No graded problems yet.</p>
        )}
      </Card>

      {/* Workout pyramid */}
      <PyramidCard />

      {/* Sends over time + recent activity */}
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card
          title="Your Sends over time"
          className="lg:col-span-2"
          right={
            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-600">last 30 days</span>
              <Legend color={ACCENT.blue} label="Problems" />
              <Legend color={ACCENT.orange} label="Routes" />
            </div>
          }
        >
          <StackedArea
            data={d.sends_over_time.map((w) => ({ lower: w.problems, upper: w.routes }))}
            colorA={ACCENT.blue}
            colorB={ACCENT.orange}
          />
          <div className="flex justify-between text-[10px] text-slate-600 mt-1">
            <span>{d.sends_over_time[0]?.week}</span>
            <span>{d.sends_over_time[Math.floor(d.sends_over_time.length / 2)]?.week}</span>
            <span>{d.sends_over_time[d.sends_over_time.length - 1]?.week}</span>
          </div>
          <div className="mt-3 flex gap-6 text-sm">
            <div><span className="text-slate-100 font-semibold">{d.me.sends}</span> <span className="text-slate-500">total sends</span></div>
            <div><span className="text-slate-100 font-semibold">{fmtSendRate(d.me.send_rate)}</span> <span className="text-slate-500">send rate</span></div>
          </div>
        </Card>

        <Card title="Your stats">
            <div className="grid grid-cols-2 gap-3 text-center">
              <Stat label="Sends" value={d.me.sends} />
              <Stat label="Attempts" value={d.me.attempts} />
              <Stat label="Send rate" value={fmtSendRate(d.me.send_rate)} />
              <Stat label="Favorites" value={d.me.favorites} />
            </div>
          </Card>

      </div>

      {/* Top problems + you / leaderboard */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Top problems" className="lg:col-span-2">
          {d.top_problems.length === 0 ? (
            <p className="text-sm text-slate-600">No climbed problems yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-slate-800">
              {d.top_problems.map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/problems/${p.id}`)}
                  className="flex items-center gap-3 py-2.5 text-left hover:bg-slate-800/40 -mx-2 px-2 rounded transition-colors"
                >
                  <span className="text-slate-100 text-sm truncate flex-1">{p.name}</span>
                  {p.grade && <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded shrink-0">{p.grade}</span>}
                  <RatingDisplay avg={p.rating_avg} count={p.rating_count} className="shrink-0" />
                  <span className="text-xs text-slate-600 w-16 text-right shrink-0">{p.ascents} ascents</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-4">
<Card title="Recent activity">
          {d.recent_activity.length === 0 ? (
            <p className="text-sm text-slate-600">Nothing logged yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {d.recent_activity.map((a, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${a.kind === "send" ? "bg-green-400" : "bg-slate-500"}`} />
                  <span className="text-slate-300 truncate">
                    <span className="text-slate-100">{a.who}</span>{" "}
                    {a.kind === "send" ? "sent" : "tried"}{" "}
                    <span className="text-slate-400">{a.name}</span>
                  </span>
                  <span className="ml-auto text-xs text-slate-600 shrink-0">{a.when ? fmtRelative(a.when) : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
          <Card title="Top climbers">
            {d.leaderboard.length === 0 ? (
              <p className="text-sm text-slate-600">No sends logged yet.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {d.leaderboard.map((c, i) => (
                  <li key={c.username} className="flex items-center gap-2 text-sm">
                    <span className="text-slate-600 w-4">{i + 1}</span>
                    <span className={`truncate ${c.username === user?.username ? "text-blue-400" : "text-slate-200"}`}>{c.username}</span>
                    <span className="ml-auto text-slate-500">{c.sends}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

type Period = "day" | "week" | "history";
const PERIOD_LABEL: Record<Period, string> = { day: "Today", week: "This week", history: "All time" };

function PyramidCard() {
  const [data, setData] = useState<PyramidData | null>(null);
  const [period, setPeriod] = useState<Period>("week");
  const [err, setErr] = useState(false);

  useEffect(() => {
    api.dashboard.pyramid().then(setData).catch(() => setErr(true));
  }, []);

  const series = data ? data[period] : [];
  const totalSends = series.reduce((acc, p) => acc + p.sends, 0);
  const hardest = [...series].reverse().find((p) => p.sends > 0)?.grade ?? "—";

  const toggle = (
    <div className="flex rounded-md bg-slate-800 p-0.5 text-xs">
      {(["day", "week", "history"] as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => setPeriod(p)}
          className={`px-2.5 py-1 rounded transition-colors ${
            period === p ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {p === "history" ? "History" : p === "week" ? "Week" : "Day"}
        </button>
      ))}
    </div>
  );

  return (
    <Card title="Your Workout Pyramid" right={toggle} className="mb-4">
      {err ? (
        <p className="text-sm text-slate-600">Couldn’t load your pyramid.</p>
      ) : !data ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : (
        <>
          <PyramidBars data={series.map((p) => ({ label: p.grade, value: p.sends }))} color={ACCENT.green} />
          <div className="mt-3 flex gap-6 text-sm">
            <div>
              <span className="text-slate-100 font-semibold">{totalSends}</span>{" "}
              <span className="text-slate-500">sends · {PERIOD_LABEL[period]}</span>
            </div>
            <div>
              <span className="text-slate-100 font-semibold">{hardest}</span>{" "}
              <span className="text-slate-500">hardest sent</span>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function Pill({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex flex-col px-4 py-2 rounded-lg bg-slate-800/60" style={{ borderLeft: `3px solid ${color}` }}>
      <span className="text-lg font-semibold text-slate-100 leading-tight">{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-slate-500">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-800/40 rounded-lg py-3">
      <p className="text-lg font-semibold text-slate-100">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
