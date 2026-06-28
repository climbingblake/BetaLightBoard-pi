import { create } from "zustand";
import { api } from "@/api";
import type { Problem, Led, SortKey } from "@/api";

interface ProblemStore {
  problems: Problem[];
  current: Problem | null;
  loading: boolean;
  error: string | null;

  fetchProblems: (filters?: { grade?: string; setter?: string; sort?: SortKey }) => Promise<void>;
  fetchProblem: (id: number) => Promise<void>;
  createProblem: (data: Partial<Problem>) => Promise<Problem>;
  updateProblem: (id: number, data: Partial<Problem>) => Promise<void>;
  deleteProblem: (id: number) => Promise<void>;
  loadToBoard: (id: number) => Promise<void>;
  clearBoard: (id: number) => Promise<void>;

  addLed: (problemId: number, row: number, col: number, rgb: string) => Promise<void>;
  updateLed: (ledId: number, rgb: string) => Promise<void>;
  deleteLed: (ledId: number) => Promise<void>;

  // Optimistic local LED state for editor
  setLocalLed: (row: number, col: number, rgb: string) => void;
}

export const useProblemStore = create<ProblemStore>((set, _get) => ({
  problems: [],
  current: null,
  loading: false,
  error: null,

  fetchProblems: async (filters) => {
    set({ loading: true, error: null });
    try {
      const problems = await api.problems.list(filters);
      set({ problems, loading: false });
    } catch (e: unknown) {
      set({ error: String(e), loading: false });
    }
  },

  fetchProblem: async (id) => {
    set({ loading: true, error: null });
    try {
      const current = await api.problems.get(id);
      set({ current, loading: false });
    } catch (e: unknown) {
      set({ error: String(e), loading: false });
    }
  },

  createProblem: async (data) => {
    const problem = await api.problems.create(data);
    set((s) => ({ problems: [problem, ...s.problems] }));
    return problem;
  },

  updateProblem: async (id, data) => {
    const updated = await api.problems.update(id, data);
    set((s) => ({
      problems: s.problems.map((p) => (p.id === id ? updated : p)),
      current: s.current?.id === id ? updated : s.current,
    }));
  },

  deleteProblem: async (id) => {
    await api.problems.delete(id);
    set((s) => ({
      problems: s.problems.filter((p) => p.id !== id),
      current: s.current?.id === id ? null : s.current,
    }));
  },

  loadToBoard: async (id) => { await api.problems.load(id); },
  clearBoard:  async (id) => {
    await api.problems.clear(id);
    set((s) => ({
      current: s.current?.id === id ? { ...s.current, leds: [] } : s.current,
    }));
  },

  addLed: async (problemId, row, col, rgb) => {
    const led = await api.leds.add(problemId, row, col, rgb);
    set((s) => ({
      current: s.current?.id === problemId
        ? { ...s.current, leds: [...s.current.leds, led] }
        : s.current,
    }));
  },

  updateLed: async (ledId, rgb) => {
    const updated = await api.leds.update(ledId, rgb);
    set((s) => ({
      current: s.current
        ? {
            ...s.current,
            leds: s.current.leds.map((l) => (l.id === ledId ? updated : l)),
          }
        : null,
    }));
  },

  deleteLed: async (ledId) => {
    await api.leds.delete(ledId);
    set((s) => ({
      current: s.current
        ? { ...s.current, leds: s.current.leds.filter((l) => l.id !== ledId) }
        : null,
    }));
  },

  setLocalLed: (row, col, rgb) => {
    set((s) => {
      if (!s.current) return s;
      const exists = s.current.leds.find((l) => l.row === row && l.col === col);
      const leds: Led[] = exists
        ? s.current.leds.map((l) =>
            l.row === row && l.col === col ? { ...l, rgb } : l
          )
        : [...s.current.leds, { id: -Date.now(), row, col, rgb }];
      return { current: { ...s.current, leds } };
    });
  },
}));
