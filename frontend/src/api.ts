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

export interface RouteHold {
  id: number;
  sequence: number;
  row: number;
  col: number;
}

export interface Route {
  id: number;
  name: string;
  description: string | null;
  duration: number;
  number_shown: number;
  repeat: boolean;
  created_at: string;
  holds: RouteHold[];
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

  routes: {
    list:   ()                => req<Route[]>("GET", "/routes"),
    get:    (id: number)      => req<Route>("GET", `/routes/${id}`),
    create: (body: Partial<Route>) => req<Route>("POST", "/routes", body),
    update: (id: number, body: Partial<Route>) => req<Route>("PUT", `/routes/${id}`, body),
    delete: (id: number)      => req<void>("DELETE", `/routes/${id}`),
    addHold:      (id: number, row: number, col: number) =>
      req<RouteHold>("POST", `/routes/${id}/holds`, { row, col }),
    removeLastHold: (id: number) => req<void>("DELETE", `/routes/${id}/holds/last`),
    preview: (id: number, row: number, col: number) =>
      req<void>("POST", `/routes/${id}/preview`, { row, col }),
    play:   (id: number, repeat: boolean) =>
      req<void>("POST", `/routes/${id}/play?repeat=${repeat}`),
    stop:   (id: number)      => req<void>("POST", `/routes/${id}/stop`),
    status: (id: number)      =>
      req<{ playing: boolean; current_index: number; total: number }>("GET", `/routes/${id}/status`),
  },
};
