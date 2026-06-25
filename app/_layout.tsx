import { useEffect } from "react";
import { View, ActivityIndicator, AppState, AppStateStatus } from "react-native";
import { Stack, router, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useAuthStore } from "@/stores/auth.store";
import { useThemeStore } from "@/stores/theme.store";
import { useColorScheme } from "nativewind";
import "../global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30_000 },
  },
});

/**
 * GUARDIA DE AUTENTICACIÓN — componente sin UI que protege todas las rutas.
 *
 * ¿Por qué un componente separado y no lógica directa en RootLayout?
 * useSegments() necesita estar dentro del árbol de expo-router (dentro de <Stack>).
 * Al separarlo como componente hijo de QueryClientProvider/Stack, puede leer
 * los segmentos de la URL activa y redirigir sin romper el árbol de React.
 *
 * Flujo:
 * - Si no está autenticado y no está en "(auth)": redirige a login.
 * - Si está autenticado y está en "(auth)" (ej: volvió atrás al login): redirige al dashboard.
 * - No hace nada mientras hydrated es false: esperamos a que SecureStore termine de leer.
 *
 * ¿Por qué router.replace() y no router.push()?
 * replace() reemplaza la pantalla en el historial de navegación.
 * Con push() el usuario podría presionar "Atrás" y volver a la pantalla protegida.
 */
function AuthGuard() {
  const { isAuthenticated, hydrated } = useAuthStore();
  const segments = useSegments();

  useEffect(() => {
    if (!hydrated) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (isAuthenticated && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, hydrated, segments]);

  return null;
}

export default function RootLayout() {
  const { hydrate, hydrated } = useAuthStore();
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  useEffect(() => {
    hydrate();
    hydrateTheme();

    // Tell React Query to refetch stale data whenever the app comes back to the foreground.
    // Without this, React Native never triggers the web-style window focus event.
    const sub = AppState.addEventListener("change", (status: AppStateStatus) => {
      focusManager.setFocused(status === "active");
    });
    return () => sub.remove();
  }, []);

  if (!hydrated) {
    const bg = isDark ? "#0C0C14" : "#F2F2F8";
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: bg }}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthGuard />
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
