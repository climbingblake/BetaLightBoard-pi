const BASE = "/api";

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    credentials: "include",
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

export interface User {
  id: number;
  username: string;
  is_admin: boolean;
}

export interface Attempt {
  id: number;
  user_id: number;
  problem_id: number | null;
  route_id: number | null;
  timestamp: string;
  notes: string | null;
}

export interface Send {
  id: number;
  user_id: number;
  problem_id: number | null;
  route_id: number | null;
  timestamp: string;
  notes: string | null;
}

export interface Favorite {
  id: number;
  user_id: number;
  problem_id: number | null;
  route_id: number | null;
  created_at: string;
}

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
  created_by: number | null;
  created_at: string;
  updated_at: string | null;
  leds: Led[];
  rating_avg: number | null;
  rating_count: number;
  ascents: number;
  attempts: number;
  send_rate: number | null;
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
  created_by: number | null;
  created_at: string;
  updated_at: string | null;
  holds: RouteHold[];
  rating_avg: number | null;
  rating_count: number;
  ascents: number;
  attempts: number;
  send_rate: number | null;
}

export type SortKey =
  | "created_desc"
  | "created_asc"
  | "rating_desc"
  | "ascents_desc"
  | "send_rate_desc";

export interface Rating {
  id: number;
  user_id: number;
  problem_id: number | null;
  route_id: number | null;
  session_id: number | null;
  stars: number;
}

export type SessionSortKey =
  | "created_desc"
  | "created_asc"
  | "rating_desc"
  | "name_asc";

export interface SessionItem {
  id: number;
  position: number;
  kind: "problem" | "route";
  ref_id: number;
  name: string;
  grade: string | null;
  holds: number;
}

export interface WorkoutSession {
  id: number;
  name: string;
  description: string | null;
  created_by: number | null;
  creator_name: string | null;
  is_public: boolean;
  created_at: string | null;
  updated_at: string | null;
  item_count: number;
  rating_avg: number | null;
  rating_count: number;
  items: SessionItem[];
}

export interface DashboardData {
  totals: { problems: number; routes: number; sessions: number; sends: number; attempts: number; climbers: number };
  new_last_7: { problems: number; routes: number; sessions: number; sends: number };
  sparklines: { problems: number[]; routes: number[]; sessions: number[]; sends: number[] };
  grade_distribution: { grade: string; count: number }[];
  grade_summary: { total: number; most_common: string | null; hardest: string | null };
  sends_over_time: { week: string; problems: number; routes: number; total: number }[];
  send_rate_overall: number | null;
  top_problems: { id: number; name: string; grade: string | null; setter: string | null; rating_avg: number | null; rating_count: number; ascents: number }[];
  recent_activity: { kind: "send" | "attempt"; target: "problem" | "route"; name: string; who: string; when: string | null }[];
  me: { sends: number; attempts: number; send_rate: number | null; favorites: number };
  leaderboard: { username: string; sends: number }[];
}

export interface PyramidPoint { grade: string; sends: number }
export interface PyramidData {
  day: PyramidPoint[];
  week: PyramidPoint[];
  history: PyramidPoint[];
  max_grade: string | null;
}

// ---- Problems ----

export const api = {
  dashboard: {
    get: () => req<DashboardData>("GET", "/dashboard"),
    pyramid: () => req<PyramidData>("GET", "/dashboard/pyramid"),
  },

  problems: {
    list: (params?: { grade?: string; setter?: string; sort?: SortKey }) => {
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

  auth: {
    me:       ()                                      => req<User>("GET", "/auth/me"),
    login:    (username: string, password: string)    => req<User>("POST", "/auth/login", { username, password }),
    logout:   ()                                      => req<void>("POST", "/auth/logout"),
    register: (username: string, password: string)    => req<User>("POST", "/auth/register", { username, password }),
    listUsers: ()                                     => req<User[]>("GET", "/auth/users"),
    deleteUser: (id: number)                          => req<void>("DELETE", `/auth/users/${id}`),
  },

  attempts: {
    list:  (params: { problem_id?: number; route_id?: number }) => {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
      ).toString();
      return req<Attempt[]>("GET", `/attempts${qs ? "?" + qs : ""}`);
    },
    log:   (body: { problem_id?: number; route_id?: number; notes?: string }) => req<Attempt>("POST", "/attempts", body),
    clear: (params: { problem_id?: number; route_id?: number }) => {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
      ).toString();
      return req<void>("DELETE", `/attempts${qs ? "?" + qs : ""}`);
    },
  },

  sends: {
    list:   (params: { problem_id?: number; route_id?: number }) => {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
      ).toString();
      return req<Send[]>("GET", `/sends${qs ? "?" + qs : ""}`);
    },
    log:    (body: { problem_id?: number; route_id?: number; notes?: string }) => req<Send>("POST", "/sends", body),
    delete: (id: number) => req<void>("DELETE", `/sends/${id}`),
  },

  favorites: {
    list:   (type?: "problem" | "route") =>
      req<Favorite[]>("GET", `/favorites${type ? "?type=" + type : ""}`),
    add:    (body: { problem_id?: number; route_id?: number }) => req<Favorite>("POST", "/favorites", body),
    remove: (id: number) => req<void>("DELETE", `/favorites/${id}`),
  },

  routes: {
    list:   (params?: { q?: string; sort?: SortKey }) => {
      const filtered = Object.fromEntries(
        Object.entries(params ?? {}).filter(([, v]) => v != null && v !== "")
      );
      const qs = new URLSearchParams(filtered).toString();
      return req<Route[]>("GET", `/routes${qs ? "?" + qs : ""}`);
    },
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

  ratings: {
    get: (params: { problem_id?: number; route_id?: number; session_id?: number }) => {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
      ).toString();
      return req<Rating | null>("GET", `/ratings/me${qs ? "?" + qs : ""}`);
    },
    set: (body: { problem_id?: number; route_id?: number; session_id?: number; stars: number }) =>
      req<Rating>("POST", "/ratings", body),
    clear: (params: { problem_id?: number; route_id?: number; session_id?: number }) => {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
      ).toString();
      return req<void>("DELETE", `/ratings${qs ? "?" + qs : ""}`);
    },
  },

  sessions: {
    list:   (params?: { public?: boolean; created_by?: number; min_stars?: number; sort?: SessionSortKey }) => {
      const filtered = Object.fromEntries(
        Object.entries(params ?? {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
      );
      const qs = new URLSearchParams(filtered).toString();
      return req<WorkoutSession[]>("GET", `/sessions${qs ? "?" + qs : ""}`);
    },
    get:    (id: number) => req<WorkoutSession>("GET", `/sessions/${id}`),
    create: (body: { name: string; description?: string }) =>
      req<WorkoutSession>("POST", "/sessions", body),
    update: (id: number, body: { name: string; description?: string }) =>
      req<WorkoutSession>("PUT", `/sessions/${id}`, body),
    delete: (id: number) => req<void>("DELETE", `/sessions/${id}`),
    addItem: (id: number, body: { problem_id?: number; route_id?: number }) =>
      req<WorkoutSession>("POST", `/sessions/${id}/items`, body),
    removeItem: (id: number, itemId: number) =>
      req<WorkoutSession>("DELETE", `/sessions/${id}/items/${itemId}`),
    reorder: (id: number, orderedIds: number[]) =>
      req<WorkoutSession>("PUT", `/sessions/${id}/items/order`, { ordered_ids: orderedIds }),
    setShared: (id: number, isPublic: boolean) =>
      req<WorkoutSession>("PUT", `/sessions/${id}/share`, { public: isPublic }),
  },

  backup: {
    // Return the raw Response so the caller can stream a file download.
    database: () => fetch(`${BASE}/backup/database`, { credentials: "include" }),
    content:  () => fetch(`${BASE}/backup/content`,  { credentials: "include" }),
  },
};

/** Trigger a browser download from a fetch Response, honoring its filename. */
export async function downloadResponse(res: Response, fallback: string) {
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const match = cd.match(/filename="?([^"]+)"?/);
  const name = match ? match[1] : fallback;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
