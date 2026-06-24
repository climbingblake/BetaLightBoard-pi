import { useState, useEffect } from "react";
import { api } from "@/api";

const ROUTINES = [
  { name: "rainbow",   label: "Rainbow",   color: "from-red-500 via-yellow-400 to-blue-500" },
  { name: "chase",     label: "Candy Chase", color: "from-pink-500 to-red-500" },
  { name: "iceflakes", label: "Iceflakes",  color: "from-blue-400 to-cyan-300" },
];

export default function Routines() {
  const [current, setCurrent] = useState<string | null>(null);
  const [brightness, setBrightness] = useState(42);

  useEffect(() => {
    api.routines.status().then((s) => setCurrent(s.current));
  }, []);

  async function handleRun(name: string) {
    await api.routines.run(name);
    setCurrent(name);
  }

  async function handleStop() {
    await api.routines.stop();
    setCurrent(null);
  }

  async function handleBrightness(val: number) {
    setBrightness(val);
    await api.routines.brightness(val);
  }

  return (
    <div className="max-w-lg mx-auto p-6 mt-8">
      <h1 className="text-2xl font-semibold text-slate-100 mb-6">Routines</h1>

      <div className="flex flex-col gap-3 mb-8">
        {ROUTINES.map(({ name, label, color }) => (
          <button
            key={name}
            onClick={() => handleRun(name)}
            className={`w-full py-3 rounded text-white font-medium text-sm transition-all
              bg-gradient-to-r ${color}
              ${current === name ? "ring-2 ring-white/40 scale-[1.01]" : "opacity-80 hover:opacity-100"}`}
          >
            {label}
            {current === name && <span className="ml-2 text-xs opacity-75">(running)</span>}
          </button>
        ))}
      </div>

      <div className="mb-8">
        <label className="text-xs text-slate-500 uppercase tracking-wider block mb-2">
          Brightness: {brightness}
        </label>
        <input
          type="range" min={10} max={255} value={brightness}
          onChange={(e) => handleBrightness(Number(e.target.value))}
          className="w-full accent-white"
        />
      </div>

      <button
        onClick={handleStop}
        disabled={!current}
        className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm transition-colors disabled:opacity-40"
      >
        Stop / All Off
      </button>
    </div>
  );
}
