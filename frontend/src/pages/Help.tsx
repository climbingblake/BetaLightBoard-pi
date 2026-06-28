import { Link } from "react-router-dom";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-slate-100 text-lg font-semibold mb-3">{title}</h2>
      <div className="text-sm text-slate-400 leading-relaxed flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="list-decimal list-inside flex flex-col gap-1.5 text-slate-300">
      {items.map((it, i) => (
        <li key={i} className="pl-1">{it}</li>
      ))}
    </ol>
  );
}

const TABS: { to: string; label: string; desc: string }[] = [
  { to: "/", label: "Dashboard", desc: "At-a-glance stats: totals, grade spread, sends over time, and recent activity." },
  { to: "/problems", label: "Problems", desc: "Boulder problems shown as lit holds. Browse, set, and log your climbs." },
  { to: "/routes", label: "Routes", desc: "Timed hold-by-hold sequences that play across the board." },
  { to: "/sessions", label: "Sessions", desc: "Ordered workouts that string problems and routes together." },
  { to: "/generate", label: "Random", desc: "Auto-generate a fresh problem with a few sliders." },
  { to: "/routines", label: "Routines", desc: "Ambient light shows and board brightness." },
  { to: "/settings", label: "Settings", desc: "Board size, users, updates, and backups." },
];

export default function Help() {
  return (
    <div className="max-w-3xl mx-auto p-6 mt-6 pb-16">
      <h1 className="text-2xl font-semibold text-slate-100 mb-2">How to use the Light Board</h1>
      <p className="text-sm text-slate-500 mb-8">
        A quick tour of the app and how to do the everyday things. Each board cell maps to one
        LED on the wall.
      </p>

      <Section title="The tabs">
        <div className="grid sm:grid-cols-2 gap-2">
          {TABS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="block bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 hover:border-slate-700 transition-colors"
            >
              <span className="text-slate-100 font-medium text-sm">{t.label}</span>
              <p className="text-xs text-slate-500 mt-0.5">{t.desc}</p>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Create & edit a problem">
        <p>A problem is a set of colored holds. By convention: green = start, blue = hands, purple = feet, red = finish.</p>
        <Steps
          items={[
            <>On <span className="text-slate-100">Problems</span>, tap <span className="text-slate-100">+ New Problem</span>, give it a name, grade, and setter, then <span className="text-slate-100">Create &amp; Start Setting</span>.</>,
            <>On the problem screen, tap <span className="text-amber-400">✎ Edit holds</span> to turn on edit mode.</>,
            <>Pick a color from the color picker, then tap board cells to place holds. Tap a lit hold again (or pick the “off” color) to remove it.</>,
            <>Tap the name to rename or change grade/setter. Tap <span className="text-slate-100">✓ Done editing</span> when finished — changes save as you go.</>,
            <>Use <span className="text-slate-100">Load to Board</span> any time to push the problem to the physical wall.</>,
          ]}
        />
        <p className="text-xs text-slate-500">Only the creator or an admin can edit a problem. Edit mode is off by default so a stray tap can’t change holds.</p>
      </Section>

      <Section title="Create & edit a route">
        <p>A route plays as a timed sequence — holds light up one after another, numbered in order from violet to orange.</p>
        <Steps
          items={[
            <>On <span className="text-slate-100">Routes</span>, tap <span className="text-slate-100">+ New Route</span>. You land in the editor.</>,
            <>Tap <span className="text-amber-400">✎ Edit holds</span>, then click a cell to preview it (it lights yellow). Click the same cell again to lock it in as the next hold in the sequence.</>,
            <>Use <span className="text-slate-100">↩ Remove Last Hold</span> to undo the most recent one.</>,
            <>Tap the name to set duration per hold and how many holds show at once.</>,
            <>Tap <span className="text-slate-100">View / Play</span> to watch it run on the board; toggle repeat to loop.</>,
          ]}
        />
      </Section>

      <Section title="Build & run a session">
        <p>A session is an ordered workout made of problems and routes.</p>
        <Steps
          items={[
            <>On <span className="text-slate-100">Sessions</span>, tap <span className="text-slate-100">+ New Session</span>, then name it.</>,
            <>Choose <span className="text-slate-100">Problem</span> or <span className="text-slate-100">Route</span>, pick one, and tap <span className="text-slate-100">+ Add</span>. Repeat to fill the workout.</>,
            <>Drag the ⠿ handle to reorder items; tap ✕ to remove one.</>,
            <>Back on the Sessions list, tap <span className="text-orange-400">▶ Run</span>. Each item loads on the board in turn — log a send or attempt, then advance to the next.</>,
            <>You can also rate the whole session while running it or on the completion screen.</>,
          ]}
        />
        <p className="text-xs text-slate-500">Shortcut: on any problem or route, use <span className="text-slate-300">Add to Session</span> to drop it straight into an existing or new session. Sessions are private until an admin shares them.</p>
      </Section>

      <Section title="Log sends & attempts">
        <p>Tracking is in the side panel on any problem or route (and in the session runner).</p>
        <Steps
          items={[
            <><span className="text-slate-100">Attempt</span> — add an optional note and tap <span className="text-slate-100">+ Log Attempt</span> for each try.</>,
            <><span className="text-green-400">Send</span> — tap <span className="text-green-400">+ Send</span>, add a note if you like, and tap <span className="text-slate-100">Record Send</span>. A send also counts as an attempt.</>,
            <>Stats update automatically: ascents and send rate show on the card and detail view.</>,
            <>Once you’ve logged an attempt or send, you can give a <span className="text-yellow-400">★ rating</span> (0–3). Tap <span className="text-yellow-400">☆ Add to Favorites</span> to pin something for quick access.</>,
          ]}
        />
      </Section>

      <Section title="A few extras">
        <p>
          Lists can be filtered and sorted (by grade, setter, rating, ascents, send rate, and more), and
          you can filter to just your favorites.
        </p>
        <p>
          Under <span className="text-slate-100">Settings → Backup &amp; Export</span> you can export your problems,
          routes, and sessions to a JSON file so you never lose your work. Admins can also download a full
          database snapshot, adjust board size and brightness, manage users, and pull updates.
        </p>
      </Section>
    </div>
  );
}
