import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/store/useAuth";

export function Nav() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  const links = [
    { to: "/",         label: "Problems" },
    { to: "/routes",   label: "Routes" },
    { to: "/generate", label: "Random" },
    { to: "/routines", label: "Routines" },
    { to: "/settings", label: "Settings" },
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
      {user && (
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {user.username}
            {user.is_admin && (
              <span className="ml-1.5 text-xs bg-blue-900/50 text-blue-400 px-1.5 py-0.5 rounded">admin</span>
            )}
          </span>
          <button
            onClick={logout}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </nav>
  );
}
