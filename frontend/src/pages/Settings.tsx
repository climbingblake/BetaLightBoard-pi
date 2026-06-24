import { useEffect, useState } from "react";
import { api } from "@/api";
import type { Setting } from "@/api";

export default function Settings() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.settings.list().then((s) => {
      setSettings(s);
      setValues(Object.fromEntries(s.map((x) => [x.key, x.value ?? ""])));
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await api.settings.update(values);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const LABELS: Record<string, string> = {
    NUMB_ROWS: "Number of rows",
    NUMB_COLS: "Number of columns",
    BRIGHTNESS: "LED brightness (0-255)",
  };

  return (
    <div className="max-w-md mx-auto p-6 mt-8">
      <h1 className="text-2xl font-semibold text-slate-100 mb-6">Settings</h1>
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        {settings.map((s) => (
          <div key={s.key}>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1">
              {LABELS[s.key] ?? s.key}
            </label>
            <input
              type="text"
              value={values[s.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded px-3 py-2 text-sm"
            />
          </div>
        ))}
        <div className="pt-2 flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {saved && <span className="text-green-500 text-sm">Saved.</span>}
        </div>
      </form>
    </div>
  );
}
