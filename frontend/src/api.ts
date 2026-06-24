const BASE = "/api";

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---- Types ----

export interface Led {
  id: number;
  row: number;
  col: number;
  rgb: string;
}

export interface Problem {
  id: number;
  name: string;
  description: string | null;
  setter: string | null;
  grade: string | null;
  created_at: string;
  leds: Led[];
}

export interface Setting {
  key: string;
  value: string | null;
}

// ---- Problems ----

export const api = {
  problems: {
    list: (params?: { grade?: string; setter?: string }) => {
      const filtered = Object.fromEntries(
        Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "undefined")
      );
      const qs = new URLSearchParams(filtered).toString();
      return req<Problem[]>("GET", `/problems${qs ? "?" + qs : ""}`);
    },
    get:    (id: number)            => req<Problem>("GET",    `/problems/${id}`),
    create: (body: Partial<Problem>) => req<Problem>("POST",   "/problems", body),
    update: (id: number, body: Partial<Problem>) =>
      req<Problem>("PUT", `/problems/${id}`, body),
    delete: (id: number)            => req<void>("DELETE", `/problems/${id}`),
    load:   (id: number)            => req<void>("POST",   `/problems/${id}/load`),
    clear:  (id: number)            => req<void>("POST",   `/problems/${id}/clear`),
    generate: (hands: number, feet: number) =>
      req<Led[]>("GET", `/problems/generate?hands=${hands}&feet=${feet}`),
    saveRandom: (name: string, leds: Led[]) =>
      req<Problem>("POST", "/problems/save_random", { name, leds }),
  },

  leds: {
    add:    (problemId: number, row: number, col: number, rgb: string) =>
      req<Led>("POST", `/problems/${problemId}/leds`, { row, col, rgb }),
    update: (ledId: number, rgb: string) =>
      req<Led>("PUT", `/leds/${ledId}`, { rgb }),
    delete: (ledId: number) =>
      req<void>("DELETE", `/leds/${ledId}`),
  },

  routines: {
    run:    (name: string) => req<void>("POST", `/routines/${name}`),
    stop:   ()             => req<void>("POST", `/routines/stop`),
    status: ()             => req<{ current: string | null }>("GET", "/routines/status"),
    brightness: (level: number) =>
      req<void>("POST", "/routines/brightness/set", { level }),
  },

  settings: {
    list:   ()                          => req<Setting[]>("GET", "/settings"),
    update: (values: Record<string, string>) =>
      req<Setting[]>("PUT", "/settings", { values }),
  },
};
