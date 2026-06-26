import { Link, useLocation } from "react-router-dom";

export function Nav() {
  const { pathname } = useLocation();

  const links = [
    { to: "/",          label: "Problems" },
    { to: "/routes",    label: "Routes" },
    { to: "/generate",  label: "Random" },
    { to: "/routines",  label: "Routines" },
    { to: "/settings",  label: "Settings" },
  ];

  return (
    <nav className="flex items-center gap-1 px-4 py-3 border-b border-slate-800 bg-slate-950">
      <span className="text-slate-200 font-semibold tracking-tight mr-6">
        Beta Light Board
      </span>
      {links.map(({ to, label }) => (
        <Link
          key={to}
          to={to}
          className={`px-3 py-1.5 rounded text-sm transition-colors ${
            pathname === to || (to !== "/" && pathname.startsWith(to))
              ? "bg-slate-800 text-white"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
