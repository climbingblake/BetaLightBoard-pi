import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Nav } from "@/components/Nav";
import ProblemList from "@/pages/ProblemList";
import ProblemEditor from "@/pages/ProblemEditor";
import NewProblem from "@/pages/NewProblem";
import Generate from "@/pages/Generate";
import Routines from "@/pages/Routines";
import Settings from "@/pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Nav />
        <main className="flex-1">
          <Routes>
            <Route path="/"                  element={<ProblemList />} />
            <Route path="/problems/new"      element={<NewProblem />} />
            <Route path="/problems/:id"      element={<ProblemEditor />} />
            <Route path="/generate"          element={<Generate />} />
            <Route path="/routines"          element={<Routines />} />
            <Route path="/settings"          element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
