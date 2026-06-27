import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api";
import type { Led } from "@/api";
import { BoardGrid } from "@/components/BoardGrid";

export default function Generate() {
  const navigate = useNavigate();
  const [hands, setHands] = useState(7);
  const [feet, setFeet] = useState(3);
  const [leds, setLeds] = useState<Led[]>([]);
  const [name, setName] = useState("Random Problem");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const result = await api.problems.generate(hands, feet);
      setLeds(result);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!leds.length) return;
    setSaving(true);
    try {
      const p = await api.problems.saveRandom(name, leds);
      navigate(`/problems/${p.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-49px)]">
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        {leds.length > 0 ? (
          <BoardGrid
            rows={10}
            cols={10}
            leds={leds}
            selectedColor=""
            onCellClick={() => {}}
            readOnly
          />
        ) : (
          <p className="text-slate-700">Generate a problem to preview it on the board</p>
        )}
      </div>

      <div className="w-64 border-l border-slate-800 bg-slate-900 hidden lg:flex flex-col gap-5 p-5">
        <h2 className="text-slate-100 font-semibold">Random Generator</h2>

        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider block mb-2">
            Hand holds: {hands}
          </label>
          <input
            type="range" min={2} max={15} value={hands}
            onChange={(e) => setHands(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
        </div>

        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider block mb-2">
            Foot holds: {feet}
          </label>
          <input
            type="range" min={0} max={8} value={feet}
            onChange={(e) => setFeet(Number(e.target.value))}
            className="w-full accent-purple-500"
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded text-sm font-medium transition-colors disabled:opacity-50"
        >
          {generating ? "Generating…" : "Generate"}
        </button>

        {leds.length > 0 && (
          <>
            <hr className="border-slate-800" />
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Problem"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
