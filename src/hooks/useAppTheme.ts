import { useColorScheme } from "nativewind";

const DARK = {
  statusBarBg:   "#0C0C14",
  tabBarBg:      "#14141E",
  tabBarBorder:  "#2A2A3C",
  tabBarInactive: "#4A4A5C",
  iconMuted:     "#4A4A5C",
  iconSecondary: "#8888A0",
  iconEmpty:     "#2A2A3C",
  placeholder:   "#4A4A5C",
  switchOff:     "#2A2A3C",
  loadingBg:     "#0C0C14",
} as const;

const LIGHT = {
  statusBarBg:   "#F2F2F8",
  tabBarBg:      "#FFFFFF",
  tabBarBorder:  "#D4D4E3",
  tabBarInactive: "#9595B0",
  iconMuted:     "#9595B0",
  iconSecondary: "#52527A",
  iconEmpty:     "#C8C8DB",
  placeholder:   "#9595B0",
  switchOff:     "#C8C8DB",
  loadingBg:     "#F2F2F8",
} as const;

export function useAppTheme() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const t = isDark ? DARK : LIGHT;
  return {
    isDark,
    barStyle: (isDark ? "light-content" : "dark-content") as "light-content" | "dark-content",
    ...t,
  };
}
