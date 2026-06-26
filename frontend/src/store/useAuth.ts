import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/api";
import type { User } from "@/api";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (username: string, password: string) => Promise<User>;
}

export const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  register: async () => { throw new Error("not ready"); },
});

export function useAuth() {
  return useContext(AuthContext);
}

export function useAuthState(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth.me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(username: string, password: string) {
    const u = await api.auth.login(username, password);
    setUser(u);
  }

  async function logout() {
    await api.auth.logout();
    setUser(null);
  }

  async function register(username: string, password: string) {
    return api.auth.register(username, password);
  }

  return { user, loading, login, logout, register };
}
