import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { Appearance } from "react-native";

interface ThemeState {
  isDark: boolean;
  hydrated: boolean;
  toggle: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  isDark: true,
  hydrated: false,

  hydrate: async () => {
    const stored = await SecureStore.getItemAsync("app_theme");
    const isDark = stored ? stored === "dark" : true;
    Appearance.setColorScheme(isDark ? "dark" : "light");
    set({ isDark, hydrated: true });
  },

  toggle: async () => {
    const next = !get().isDark;
    set({ isDark: next });
    await SecureStore.setItemAsync("app_theme", next ? "dark" : "light");
    Appearance.setColorScheme(next ? "dark" : "light");
  },
}));
