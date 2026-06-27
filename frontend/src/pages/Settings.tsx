import { useEffect, useState } from "react";
import { api } from "@/api";
import type { Setting, User } from "@/api";
import { useAuth } from "@/store/useAuth";

export default function Settings() {
  const { user: currentUser } = useAuth();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState("");
  const [updateStatus, setUpdateStatus] = useState<"idle" | "ok" | "error">("idle");
  const [commit, setCommit] = useState("");

  // User management (admin only)
  const [users, setUsers] = useState<User[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [userError, setUserError] = useState("");
  const [userSaving, setUserSaving] = useState(false);

  useEffect(() => {
    api.settings.list().then((s) => {
      setSettings(s);
      setValues(Object.fromEntries(s.map((x) => [x.key, x.value ?? ""])));
    });
    fetch("/api/system/version")
      .then((r) => r.json())
      .then((d) => setCommit(d.commit));

    if (currentUser?.is_admin) {
      api.auth.listUsers().then(setUsers);
    }
  }, [currentUser]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await api.settings.update(values);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleUpdate() {
    if (!confirm("Pull latest code and restart the service?")) return;
    setUpdating(true);
    setUpdateStatus("idle");
    setUpdateMsg("Fetching latest code…");
    try {
      const res = await fetch("/api/system/update", { method: "POST" });
      const data = await res.json();
      if (data.status === "ok") {
        setUpdateStatus("ok");
        setUpdateMsg(data.message + " Page will reload in 8s.");
        setTimeout(() => window.location.reload(), 8000);
      } else {
        setUpdateStatus("error");
        setUpdateMsg(data.message || "Update failed.");
        setUpdating(false);
      }
    } catch {
      setUpdateStatus("error");
      setUpdateMsg("Could not reach the server. Check the Pi.");
      setUpdating(false);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setUserError("");
    setUserSaving(true);
    try {
      await api.auth.register(newUsername, newPassword);
      if (newIsAdmin) {
        // fetch the new user list to get the id, then we'd need a set-admin endpoint
        // for now just refresh the list
      }
      const updated = await api.auth.listUsers();
      setUsers(updated);
      setNewUsername("");
      setNewPassword("");
      setNewIsAdmin(false);
    } catch (err) {
      setUserError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setUserSaving(false);
    }
  }

  async function handleDeleteUser(id: number) {
    if (!confirm("Delete this user and all their activity data?")) return;
    await api.auth.deleteUser(id);
    setUsers((u) => u.filter((x) => x.id !== id));
  }

  const LABELS: Record<string, string> = {
    NUMB_ROWS: "Number of rows",
    NUMB_COLS: "Number of columns",
    BRIGHTNESS: "LED brightness (0-255)",
  };

  return (
    <div className="max-w-md mx-auto p-6 mt-8">
      <h1 className="text-2xl font-semibold text-slate-100 mb-6">Settings</h1>

      <form onSubmit={handleSave} className="flex flex-col gap-4 mb-10">
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

      <hr className="border-slate-800 mb-8" />

      {/* User Management — admin only */}
      {currentUser?.is_admin && (
        <>
          <div className="mb-8">
            <h2 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-4">Users</h2>

            <div className="flex flex-col gap-2 mb-6">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-slate-200 text-sm">{u.username}</span>
                    {u.is_admin && (
                      <span className="text-xs bg-blue-900/50 text-blue-400 px-1.5 py-0.5 rounded">admin</span>
                    )}
                    {u.id === currentUser.id && (
                      <span className="text-xs text-slate-600">(you)</span>
                    )}
                  </div>
                  {u.id !== currentUser.id && (
                    <button
                      onClick={() => handleDeleteUser(u.id)}
                      className="text-slate-600 hover:text-red-400 text-xs transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            <form onSubmit={handleCreateUser} className="flex flex-col gap-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Add user</p>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Username"
                required
                className="bg-slate-900 border border-slate-700 text-slate-100 rounded px-3 py-2 text-sm"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Password"
                required
                className="bg-slate-900 border border-slate-700 text-slate-100 rounded px-3 py-2 text-sm"
              />
              {userError && <p className="text-red-400 text-xs">{userError}</p>}
              <button
                type="submit"
                disabled={userSaving}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-sm font-medium transition-colors disabled:opacity-50"
              >
                {userSaving ? "Creating…" : "Create user"}
              </button>
            </form>
          </div>

          <hr className="border-slate-800 mb-8" />
        </>
      )}

      <div>
        <h2 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-4">System</h2>
        {commit && (
          <p className="text-xs text-slate-600 mb-4">Current commit: <code className="text-slate-500">{commit}</code></p>
        )}
        <button
          onClick={handleUpdate}
          disabled={updating}
          className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm font-medium transition-colors disabled:opacity-50"
        >
          {updating ? "Updating…" : "Pull & Restart"}
        </button>
        {updateMsg && (
          <p className={`text-xs mt-3 ${
            updateStatus === "ok" ? "text-green-500" :
            updateStatus === "error" ? "text-red-400" :
            "text-yellow-500"
          }`}>{updateMsg}</p>
        )}
      </div>
    </div>
  );
}
