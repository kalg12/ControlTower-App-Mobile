import { create } from "zustand";
import axios from "axios";
import { AuthUser } from "@/types/auth";
import { clearTokens, getAccessToken, hydrateUser } from "@/api/auth.api";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:8080";

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  hydrated: boolean;
  setUser: (user: AuthUser) => void;
  hydrate: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  hydrated: false,

  setUser: (user) => set({ user, isAuthenticated: true }),

  hydrate: async () => {
    const user = await hydrateUser();
    set({ user, isAuthenticated: !!user, hydrated: true });
  },

  logout: async () => {
    try {
      const token = await getAccessToken();
      if (token) {
        axios.post(`${BASE_URL}/api/v1/auth/logout`, {}, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {}
    await clearTokens();
    set({ user: null, isAuthenticated: false });
  },
}));
