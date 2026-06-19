import { create } from "zustand";
import axios from "axios";
import { AuthUser } from "@/types/auth";
import { clearTokens, getRefreshToken, hydrateUser, saveUser } from "@/api/auth.api";

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

  setUser: (user) => {
    saveUser(user); // persist to SecureStore for hydration on next app launch
    set({ user, isAuthenticated: true });
  },

  hydrate: async () => {
    const user = await hydrateUser();
    set({ user, isAuthenticated: !!user, hydrated: true });
  },

  logout: async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        // Backend requires { refreshToken } in body — not a Bearer header
        axios.post(`${BASE_URL}/api/v1/auth/logout`, { refreshToken });
      }
    } catch {}
    await clearTokens();
    set({ user: null, isAuthenticated: false });
  },
}));
