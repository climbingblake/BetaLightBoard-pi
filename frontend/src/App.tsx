import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Nav } from "@/components/Nav";
import Dashboard from "@/pages/Dashboard";
import ProblemList from "@/pages/ProblemList";
import ProblemEditor from "@/pages/ProblemEditor";
import NewProblem from "@/pages/NewProblem";
import Generate from "@/pages/Generate";
import Routines from "@/pages/Routines";
import Settings from "@/pages/Settings";
import RouteList from "@/pages/RouteList";
import RouteShow from "@/pages/RouteShow";
import RouteEditor from "@/pages/RouteEditor";
import SessionList from "@/pages/SessionList";
import SessionEditor from "@/pages/SessionEditor";
import SessionRunner from "@/pages/SessionRunner";
import Help from "@/pages/Help";
import Login from "@/pages/Login";
import { AuthContext, useAuth, useAuthState } from "@/store/useAuth";

function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuthState();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function AppShell() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <span className="text-slate-600 text-sm">Loading…</span>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1">
        <Routes>
          <Route path="/"                element={<Dashboard />} />
          <Route path="/problems"        element={<ProblemList />} />
          <Route path="/problems/new"    element={<NewProblem />} />
          <Route path="/problems/:id"    element={<ProblemEditor />} />
          <Route path="/generate"        element={<Generate />} />
          <Route path="/routines"        element={<Routines />} />
          <Route path="/settings"        element={<Settings />} />
          <Route path="/help"            element={<Help />} />
          <Route path="/routes"          element={<RouteList />} />
          <Route path="/routes/:id"      element={<RouteShow />} />
          <Route path="/routes/:id/edit" element={<RouteEditor />} />
          <Route path="/sessions"           element={<SessionList />} />
          <Route path="/sessions/:id/edit"  element={<SessionEditor />} />
          <Route path="/sessions/:id/run"   element={<SessionRunner />} />
          <Route path="*"                element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
