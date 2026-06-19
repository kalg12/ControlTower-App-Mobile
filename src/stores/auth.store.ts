import { create } from "zustand";
import { AuthUser } from "@/types/auth";
import { clearTokens } from "@/api/auth.api";
import { apiClient } from "@/api/client";

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  setUser: (user: AuthUser) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,

  setUser: (user) => set({ user, isAuthenticated: true }),

  logout: async () => {
    try {
      await apiClient.post("/api/v1/auth/logout");
    } catch {}
    await clearTokens();
    set({ user: null, isAuthenticated: false });
  },
}));
