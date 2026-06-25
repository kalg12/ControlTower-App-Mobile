import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StatusBar,
  TouchableOpacity,
  Modal,
  Switch,
  Alert,
  ActivityIndicator,
  Platform,
  Animated,
  StyleSheet,
} from "react-native";
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { apiClient } from "@/api/client";
import { useAuthStore } from "@/stores/auth.store";
import { useThemeStore } from "@/stores/theme.store";
import { useTicketStats } from "@/queries/tickets.queries";
import { useAppTheme } from "@/hooks/useAppTheme";
import { TicketStatus } from "@/types/ticket";
import { timeAgo } from "@/utils/timeAgo";

/* ─── Types ─── */

interface DashboardStats {
  totalClients: number;
  activeBranches: number;
  branchesUp: number;
  branchesDown: number;
  branchesDegraded: number;
  openIncidents: number;
  alertBranches: { branchId: string; branchName: string; clientName: string; status: string }[];
  openTickets: number;
  ticketsInProgress: number;
  slaBreachedTickets: number;
  activeLicenses: number;
  trialLicenses: number;
  expiredLicenses: number;
  unreadNotifications: number;
}

interface BranchHealthSummary {
  branchId: string;
  branchName: string;
  clientName: string;
  status: string;
  latencyMs: number | null;
  version: string | null;
  lastCheckedAt: string | null;
  openIncidents: number;
  errorMessage: string | null;
}

/* ─── Helpers ─── */

function formatResolutionTime(hours: number | null | undefined): string {
  if (!hours) return "Sin datos";
  if (hours < 1 / 60) return "< 1m";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function goToTickets(status: TicketStatus) {
  router.push({ pathname: "/(tabs)/tickets", params: { initialStatus: status } });
}

function getHealthStyle(status: string): {
  label: string; color: string; bg: string; border: string;
  icon: keyof typeof Ionicons.glyphMap;
} {
  switch (status?.toUpperCase()) {
    case "UP": case "HEALTHY": case "OK":
      return { label: "Activo", color: "#34D399", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: "checkmark-circle" };
    case "DEGRADED": case "WARNING":
      return { label: "Degradado", color: "#F97316", bg: "bg-orange-500/10", border: "border-orange-500/20", icon: "warning" };
    case "DOWN": case "CRITICAL": case "ERROR":
      return { label: "Caído", color: "#EF4444", bg: "bg-red-500/10", border: "border-red-500/20", icon: "alert-circle" };
    default:
      return { label: status ?? "Desconocido", color: "#4A4A5C", bg: "bg-dark-raised", border: "border-dark-border", icon: "help-circle" };
  }
}

/* ─── Screen ─── */

export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const [showProfile, setShowProfile] = useState(false);
  const { barStyle, statusBarBg, iconSecondary, iconMuted } = useAppTheme();
  const { data: ticketStats, isLoading: statsLoading, isFetching: statsFetching, refetch: refetchStats } = useTicketStats();

  const { data: dash, isLoading: dashLoading, isFetching: dashFetching, refetch: refetchDash } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async (): Promise<DashboardStats> => {
      const res = await apiClient.get("/api/v1/dashboard");
      return res.data;
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const { data: healthList, isLoading: healthLoading, isFetching: healthFetching, refetch: refetchHealth } = useQuery({
    queryKey: ["health", "clients"],
    queryFn: async (): Promise<BranchHealthSummary[]> => {
      const res = await apiClient.get("/api/v1/health/clients");
      return res.data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });

  const isLoading = statsLoading || dashLoading || healthLoading;
  const isRefreshing = (statsFetching || dashFetching || healthFetching) && !isLoading;
  const skeletonPulse = useSkeletonPulse();

  // Full-screen loader: visible only for the initial load (no cached data yet).
  // useState lazily initialises to false when data is already in cache (tab revisit).
  const [loaderVisible, setLoaderVisible] = useState(() => !dash && !ticketStats);
  const loaderOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isLoading && loaderVisible) {
      Animated.timing(loaderOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setLoaderVisible(false);
      });
    }
  }, [isLoading]);

  const hasAnyData = !!dash || !!ticketStats;
  const showError = !loaderVisible && !hasAnyData;

  function handleRefresh() {
    refetchStats();
    refetchDash();
    refetchHealth();
  }

  const initials =
    user?.fullName?.split(" ").slice(0, 2).map((n) => n[0]).join("") ?? "?";

  const downCount = (healthList ?? []).filter(
    (b) => ["DOWN", "CRITICAL", "ERROR"].includes(b.status?.toUpperCase() ?? "")
  ).length;
  const degradedCount = (healthList ?? []).filter(
    (b) => ["DEGRADED", "WARNING"].includes(b.status?.toUpperCase() ?? "")
  ).length;

  return (
    <>
      {showError ? (
        <DashboardErrorScreen onRetry={handleRefresh} isRetrying={isRefreshing} />
      ) : (
      <ScrollView
        className="flex-1 bg-dark-bg"
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#7C3AED" />
        }
      >
        <StatusBar barStyle={barStyle} backgroundColor={statusBarBg} />

        {/* ── Header ── */}
        <View className="bg-dark-surface border-b border-dark-border px-5 pt-16 pb-5">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 mr-3">
              <Text className="text-content-secondary text-sm">Bienvenido de vuelta</Text>
              <Text className="text-content-primary text-xl font-bold mt-0.5" numberOfLines={1}>
                {user?.fullName ?? "Agente"}
              </Text>
            </View>

            {/* Avatar button */}
            <TouchableOpacity
              onPress={() => {
                setShowProfile(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              activeOpacity={0.8}
            >
              <AvatarBadge avatarUrl={user?.avatarUrl} initials={initials} size={42} />
            </TouchableOpacity>
          </View>

          {/* Alert banner */}
          {downCount > 0 && (
            <View className="mt-3 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 flex-row items-center gap-2">
              <Ionicons name="alert-circle" size={16} color="#EF4444" />
              <Text className="text-red-400 text-xs font-semibold flex-1">
                {downCount} sucursal{downCount > 1 ? "es" : ""} caída{downCount > 1 ? "s" : ""}
                {dash?.openIncidents ? ` · ${dash.openIncidents} incidentes abiertos` : ""}
              </Text>
            </View>
          )}
        </View>

        <View className="p-4 gap-3">

          {/* ── Real dashboard stats ── */}
          {dashLoading && !dash ? (
            <DashSkeleton pulse={skeletonPulse} />
          ) : dash && (
            <>
              <SectionHeader title="Resumen general" />
              <View className="flex-row gap-3">
                <MiniStat icon="people-outline" iconColor="#A78BFA" label="Clientes" value={String(dash.totalClients)} />
                <MiniStat icon="storefront-outline" iconColor="#60A5FA" label="Sucursales" value={`${dash.branchesUp}/${dash.activeBranches}`} sub="activas" />
                <MiniStat icon="alert-circle-outline" iconColor="#EF4444" label="Incidentes" value={String(dash.openIncidents)} alert={dash.openIncidents > 0} />
              </View>

              {dash.slaBreachedTickets > 0 && (
                <TouchableOpacity
                  onPress={() => router.push({ pathname: "/(tabs)/tickets", params: { slaAtRisk: "true" } })}
                  className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex-row items-center justify-between"
                  activeOpacity={0.7}
                >
                  <View className="flex-row items-center gap-2">
                    <Ionicons name="timer-outline" size={18} color="#EF4444" />
                    <View>
                      <Text className="text-red-400 font-semibold text-sm">SLA incumplidos</Text>
                      <Text className="text-red-400/70 text-xs">Requieren atención inmediata</Text>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-red-400 text-xl font-bold">{dash.slaBreachedTickets}</Text>
                    <Ionicons name="chevron-forward" size={14} color="#EF4444" />
                  </View>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* ── Ticket status grid ──
               Los conteos usan totalElements de la misma lista filtrada por estado
               que muestra Tickets, para mantener ambas vistas sincronizadas.           */}
          {statsLoading && !ticketStats ? (
            <TicketStatsSkeleton pulse={skeletonPulse} />
          ) : ticketStats && (
            <>
              <SectionHeader
                title="Estado de tickets"
                action={{ label: "Ver todos", onPress: () => router.push("/(tabs)/tickets") }}
              />
              <View className="flex-row gap-3">
                <StatCard
                  label="Abiertos"
                  value={ticketStats.byStatus.OPEN ?? 0}
                  color="text-blue-400" bg="bg-blue-500/10" border="border-blue-500/20"
                  icon="mail-open-outline" iconColor="#60A5FA"
                  onPress={() => goToTickets("OPEN")}
                />
                <StatCard
                  label="En progreso"
                  value={ticketStats.byStatus.IN_PROGRESS ?? 0}
                  color="text-amber-400" bg="bg-amber-500/10" border="border-amber-500/20"
                  icon="play-circle-outline" iconColor="#FBBF24"
                  onPress={() => goToTickets("IN_PROGRESS")}
                />
              </View>
              <View className="flex-row gap-3">
                <StatCard
                  label="En espera"
                  value={ticketStats.byStatus.WAITING ?? 0}
                  color="text-yellow-400" bg="bg-yellow-500/10" border="border-yellow-500/20"
                  icon="pause-circle-outline" iconColor="#FDE047"
                  onPress={() => goToTickets("WAITING")}
                />
                <StatCard
                  label="Resueltos"
                  value={ticketStats.byStatus.RESOLVED ?? 0}
                  color="text-emerald-400" bg="bg-emerald-500/10" border="border-emerald-500/20"
                  icon="checkmark-circle-outline" iconColor="#34D399"
                  onPress={() => goToTickets("RESOLVED")}
                />
              </View>
              <TouchableOpacity
                onPress={() => router.push("/(tabs)/tickets")}
                className="bg-dark-surface border border-dark-border rounded-2xl p-4 flex-row justify-between items-center"
                activeOpacity={0.7}
              >
                <View className="flex-row items-center gap-2">
                  <Ionicons name="ticket-outline" size={18} color={iconSecondary} />
                  <Text className="text-content-secondary text-sm">Total tickets</Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <Text className="text-content-primary text-2xl font-bold">{ticketStats.total}</Text>
                  <Ionicons name="chevron-forward" size={16} color={iconMuted} />
                </View>
              </TouchableOpacity>
            </>
          )}

          {/* ── Health: branch status ── */}
          {healthLoading && !(healthList ?? []).length ? (
            <HealthSkeleton pulse={skeletonPulse} />
          ) : (healthList ?? []).length > 0 && (
            <>
              <SectionHeader title="Estado de sucursales">
                <View className="flex-row items-center gap-1.5">
                  {downCount > 0 && (
                    <View className="bg-red-500/15 border border-red-500/30 px-2 py-0.5 rounded-full flex-row items-center gap-1">
                      <Ionicons name="alert-circle" size={10} color="#EF4444" />
                      <Text className="text-[10px] text-red-400 font-bold">{downCount} caídas</Text>
                    </View>
                  )}
                  {degradedCount > 0 && (
                    <View className="bg-orange-500/15 border border-orange-500/30 px-2 py-0.5 rounded-full flex-row items-center gap-1">
                      <Ionicons name="warning" size={10} color="#F97316" />
                      <Text className="text-[10px] text-orange-400 font-bold">{degradedCount} degradadas</Text>
                    </View>
                  )}
                </View>
              </SectionHeader>

              <View className="bg-dark-surface border border-dark-border rounded-2xl overflow-hidden">
                {(healthList ?? []).slice(0, 8).map((branch, idx, arr) => (
                  <BranchHealthRow key={branch.branchId} branch={branch} last={idx === arr.length - 1} />
                ))}
              </View>
              {(healthList ?? []).length > 8 && (
                <Text className="text-content-muted text-xs text-center">
                  +{(healthList ?? []).length - 8} sucursales más
                </Text>
              )}
            </>
          )}

          {/* ── Quick actions ── */}
          <SectionHeader title="Acceso rápido" />
          <View className="flex-row gap-3">
            <QuickAction icon="mail-outline" label="Abiertos" color="#60A5FA" onPress={() => goToTickets("OPEN")} />
            <QuickAction icon="timer-outline" label="SLA en riesgo" color="#F97316"
              onPress={() => router.push({ pathname: "/(tabs)/tickets", params: { slaAtRisk: "true" } })} />
            <QuickAction icon="albums-outline" label="Kanban" color="#7C3AED"
              onPress={() => router.push("/(tabs)/kanban")} />
          </View>
        </View>
      </ScrollView>
      )}

      {loaderVisible && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: loaderOpacity, zIndex: 100 }]}
        >
          <DashboardLoader />
        </Animated.View>
      )}

      {/* ── Profile sheet ── */}
      <ProfileSheet
        visible={showProfile}
        onClose={() => setShowProfile(false)}
      />
    </>
  );
}

/* ─── Avatar badge ─── */

function AvatarBadge({
  avatarUrl,
  initials,
  size = 40,
}: {
  avatarUrl?: string | null;
  initials: string;
  size?: number;
}) {
  const radius = size * 0.28;
  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
        transition={200}
      />
    );
  }
  return (
    <View
      className="bg-brand items-center justify-center"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <Text className="text-white font-bold" style={{ fontSize: size * 0.32 }}>
        {initials}
      </Text>
    </View>
  );
}

/* ─── Profile bottom sheet ─── */

function ProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const { switchOff } = useAppTheme();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const initials = user?.fullName?.split(" ").slice(0, 2).map((n) => n[0]).join("") ?? "?";

  async function handleChangePhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permiso requerido", "Necesitamos acceso a tu galería para cambiar la foto.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append("file", {
        uri: asset.uri,
        name: asset.fileName ?? "avatar.jpg",
        type: asset.mimeType ?? "image/jpeg",
      } as never);
      const uploadRes = await apiClient.post("/api/v1/account/avatar/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const newUrl: string = uploadRes.data?.data ?? uploadRes.data;
      await apiClient.put("/api/v1/account/avatar", { avatarUrl: newUrl });
      if (user) setUser({ ...user, avatarUrl: newUrl });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "No se pudo actualizar la foto. Intenta de nuevo.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  function handleLogout() {
    Alert.alert("Cerrar sesión", "¿Estás seguro de que quieres salir?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: async () => {
          onClose();
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity className="flex-1 bg-black/60" activeOpacity={1} onPress={onClose} />
      <View className="bg-dark-surface border-t border-dark-border rounded-t-3xl overflow-hidden">
        {/* Handle */}
        <View className="w-10 h-1 bg-dark-border rounded-full self-center mt-3" />

        {/* Profile hero */}
        <View className="items-center pt-6 pb-5 px-5">
          <TouchableOpacity onPress={handleChangePhoto} activeOpacity={0.8} className="relative">
            <AvatarBadge avatarUrl={user?.avatarUrl} initials={initials} size={80} />
            {/* Camera overlay */}
            <View
              className="absolute bottom-0 right-0 w-7 h-7 bg-brand rounded-full items-center justify-center border-2 border-dark-surface"
            >
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="camera" size={13} color="#fff" />
              )}
            </View>
          </TouchableOpacity>

          <Text className="text-content-primary text-lg font-bold mt-3">{user?.fullName}</Text>
          <Text className="text-content-muted text-sm mt-0.5">{user?.email}</Text>

          <View className="flex-row gap-2 mt-2.5 flex-wrap justify-center">
            {user?.superAdmin && (
              <View className="bg-brand/20 border border-brand/30 px-2.5 py-0.5 rounded-full">
                <Text className="text-brand-light text-xs font-semibold">Super Admin</Text>
              </View>
            )}
            {user?.roles?.slice(0, 2).map((r) => (
              <View key={r} className="bg-dark-raised border border-dark-border px-2.5 py-0.5 rounded-full">
                <Text className="text-content-muted text-xs">{r}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Divider */}
        <View className="h-px bg-dark-border mx-5" />

        {/* Options */}
        <View className="px-3 py-2">

          {/* Dark/light mode toggle */}
          <View className="flex-row items-center px-3 py-3.5 rounded-2xl">
            <View className="w-9 h-9 rounded-xl bg-dark-raised border border-dark-border items-center justify-center mr-3">
              <Ionicons
                name={isDark ? "moon" : "sunny"}
                size={17}
                color={isDark ? "#A78BFA" : "#FBBF24"}
              />
            </View>
            <View className="flex-1">
              <Text className="text-content-primary text-sm font-medium">
                {isDark ? "Modo oscuro" : "Modo claro"}
              </Text>
              <Text className="text-content-muted text-xs">Apariencia de la aplicación</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={() => { toggleTheme(); Haptics.selectionAsync(); }}
              trackColor={{ true: "#7C3AED", false: switchOff }}
              thumbColor="#fff"
            />
          </View>

          {/* Ajustes */}
          <SheetRow
            icon="settings-outline"
            label="Ajustes"
            sub="Notificaciones y preferencias"
            onPress={() => { onClose(); setTimeout(() => router.push("/(tabs)/settings"), 150); }}
          />

          {/* Tickets */}
          <SheetRow
            icon="ticket-outline"
            label="Mis tickets"
            sub="Ver tickets asignados a mí"
            onPress={() => {
              onClose();
              setTimeout(() => router.push({ pathname: "/(tabs)/tickets", params: { assigneeId: user?.id } }), 150);
            }}
          />

          {/* Kanban */}
          <SheetRow
            icon="albums-outline"
            label="Kanban"
            sub="Tablero de tareas"
            onPress={() => { onClose(); setTimeout(() => router.push("/(tabs)/kanban"), 150); }}
          />
        </View>

        {/* Divider */}
        <View className="h-px bg-dark-border mx-5" />

        {/* Logout */}
        <View className="px-3 py-2 pb-10">
          <TouchableOpacity
            onPress={handleLogout}
            className="flex-row items-center px-3 py-3.5 rounded-2xl"
            activeOpacity={0.7}
          >
            <View className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/20 items-center justify-center mr-3">
              <Ionicons name="log-out-outline" size={17} color="#EF4444" />
            </View>
            <Text className="text-red-400 text-sm font-semibold">Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function SheetRow({
  icon,
  label,
  sub,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
  onPress: () => void;
}) {
  const { iconSecondary, iconMuted } = useAppTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center px-3 py-3.5 rounded-2xl active:bg-dark-raised"
      activeOpacity={0.7}
    >
      <View className="w-9 h-9 rounded-xl bg-dark-raised border border-dark-border items-center justify-center mr-3">
        <Ionicons name={icon} size={17} color={iconSecondary} />
      </View>
      <View className="flex-1">
        <Text className="text-content-primary text-sm font-medium">{label}</Text>
        <Text className="text-content-muted text-xs">{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={iconMuted} />
    </TouchableOpacity>
  );
}

/* ─── Skeleton utilities ─── */

function useSkeletonPulse(): Animated.Value {
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return opacity;
}

function SkeletonBox({ pulse, style, rounded = 10 }: {
  pulse: Animated.Value;
  style?: object;
  rounded?: number;
}) {
  return (
    <Animated.View style={[{ backgroundColor: "#2A2A3C", borderRadius: rounded, opacity: pulse }, style]} />
  );
}

function DashSkeleton({ pulse }: { pulse: Animated.Value }) {
  return (
    <>
      <SkeletonBox pulse={pulse} style={{ height: 11, width: 120, marginBottom: 6, marginLeft: 4 }} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              flex: 1, borderRadius: 16, padding: 12, alignItems: "center", gap: 7,
              backgroundColor: "#14141E", borderWidth: 1, borderColor: "#2A2A3C",
            }}
          >
            <SkeletonBox pulse={pulse} style={{ width: 22, height: 22, borderRadius: 11 }} />
            <SkeletonBox pulse={pulse} style={{ width: 34, height: 20, borderRadius: 6 }} />
            <SkeletonBox pulse={pulse} style={{ width: 48, height: 10, borderRadius: 5 }} />
          </View>
        ))}
      </View>
    </>
  );
}

function TicketStatsSkeleton({ pulse }: { pulse: Animated.Value }) {
  return (
    <>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6, paddingHorizontal: 4 }}>
        <SkeletonBox pulse={pulse} style={{ height: 11, width: 130 }} />
        <SkeletonBox pulse={pulse} style={{ height: 11, width: 56, borderRadius: 5 }} />
      </View>
      {[0, 1].map((row) => (
        <View key={row} style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
          {[0, 1].map((col) => (
            <View
              key={col}
              style={{
                flex: 1, borderRadius: 16, padding: 16, gap: 8,
                backgroundColor: "#14141E", borderWidth: 1, borderColor: "#2A2A3C",
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <SkeletonBox pulse={pulse} style={{ width: 18, height: 18, borderRadius: 5 }} />
                <SkeletonBox pulse={pulse} style={{ width: 11, height: 11, borderRadius: 4 }} />
              </View>
              <SkeletonBox pulse={pulse} style={{ width: 40, height: 32, borderRadius: 6 }} />
              <SkeletonBox pulse={pulse} style={{ width: 68, height: 10, borderRadius: 5 }} />
            </View>
          ))}
        </View>
      ))}
      <View
        style={{
          borderRadius: 16, padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center",
          backgroundColor: "#14141E", borderWidth: 1, borderColor: "#2A2A3C",
        }}
      >
        <SkeletonBox pulse={pulse} style={{ width: 100, height: 14, borderRadius: 5 }} />
        <SkeletonBox pulse={pulse} style={{ width: 44, height: 26, borderRadius: 8 }} />
      </View>
    </>
  );
}

function HealthSkeleton({ pulse }: { pulse: Animated.Value }) {
  return (
    <>
      <SkeletonBox pulse={pulse} style={{ height: 11, width: 150, marginBottom: 6, marginLeft: 4 }} />
      <View style={{ backgroundColor: "#14141E", borderRadius: 16, borderWidth: 1, borderColor: "#2A2A3C", overflow: "hidden" }}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12,
              borderBottomWidth: i < 3 ? 1 : 0, borderBottomColor: "#2A2A3C",
            }}
          >
            <SkeletonBox pulse={pulse} style={{ width: 32, height: 32, borderRadius: 10 }} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonBox pulse={pulse} style={{ height: 13, width: "65%" }} />
              <SkeletonBox pulse={pulse} style={{ height: 10, width: "42%" }} />
            </View>
            <SkeletonBox pulse={pulse} style={{ width: 58, height: 20, borderRadius: 10 }} />
          </View>
        ))}
      </View>
    </>
  );
}

/* ─── Sub-components ─── */

function SectionHeader({
  title, action, children,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  children?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between px-1 mt-1 mb-0.5">
      <Text className="text-content-secondary text-xs font-semibold uppercase tracking-wider">{title}</Text>
      <View className="flex-row items-center gap-2">
        {children}
        {action && (
          <TouchableOpacity onPress={action.onPress}>
            <Text className="text-brand-light text-xs">{action.label}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function MiniStat({ icon, iconColor, label, value, sub, alert }: {
  icon: keyof typeof Ionicons.glyphMap; iconColor: string; label: string;
  value: string; sub?: string; alert?: boolean;
}) {
  return (
    <View className="flex-1 bg-dark-surface border border-dark-border rounded-2xl p-3 items-center gap-1">
      <Ionicons name={icon} size={18} color={alert ? "#EF4444" : iconColor} />
      <Text className={`text-lg font-bold ${alert ? "text-red-400" : "text-content-primary"}`}>{value}</Text>
      <Text className="text-content-muted text-[10px] text-center leading-3">
        {sub ? `${label}\n${sub}` : label}
      </Text>
    </View>
  );
}

function StatCard({ label, value, color, bg, border, icon, iconColor, onPress }: {
  label: string; value: number; color: string; bg: string; border: string;
  icon: keyof typeof Ionicons.glyphMap; iconColor: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} className={`flex-1 ${bg} border ${border} rounded-2xl p-4`} activeOpacity={0.7}>
      <View className="flex-row items-center justify-between mb-2">
        <Ionicons name={icon} size={16} color={iconColor} />
        <Ionicons name="chevron-forward" size={12} color={iconColor} style={{ opacity: 0.5 }} />
      </View>
      <Text className={`text-3xl font-bold ${color}`}>{value}</Text>
      <Text className="text-content-secondary text-xs mt-1">{label}</Text>
    </TouchableOpacity>
  );
}

function QuickAction({ icon, label, color, onPress }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; color: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-1 bg-dark-surface border border-dark-border rounded-2xl p-3 items-center gap-2"
      activeOpacity={0.7}
    >
      <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: color + "22" }}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text className="text-content-muted text-[10px] text-center leading-3">{label}</Text>
    </TouchableOpacity>
  );
}

/* ─── Initial load overlay ─── */

function DashboardLoader() {
  const { isDark } = useAppTheme();
  const bg = isDark ? "#0C0C14" : "#F2F2F8";
  const textColor = isDark ? "#8888A0" : "#52527A";
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.07, duration: 900, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: bg, alignItems: "center", justifyContent: "center" }]}>
      <Animated.View style={[{
        width: 80, height: 80, borderRadius: 24,
        backgroundColor: "#7C3AED",
        alignItems: "center", justifyContent: "center",
        marginBottom: 28,
        shadowColor: "#7C3AED",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.45, shadowRadius: 24,
        elevation: 12,
      }, { transform: [{ scale }] }]}>
        <Text style={{ color: "#fff", fontSize: 26, fontWeight: "800", letterSpacing: 1 }}>CT</Text>
      </Animated.View>
      <ActivityIndicator size="large" color="#7C3AED" style={{ marginBottom: 16 }} />
      <Text style={{ color: textColor, fontSize: 14, fontWeight: "500", letterSpacing: 0.3 }}>
        Cargando dashboard...
      </Text>
    </View>
  );
}

function DashboardErrorScreen({ onRetry, isRetrying }: { onRetry: () => void; isRetrying: boolean }) {
  const { isDark } = useAppTheme();
  const bg = isDark ? "#0C0C14" : "#F2F2F8";
  const textPrimary = isDark ? "#FFFFFF" : "#14141E";
  const textSub = isDark ? "#8888A0" : "#52527A";

  return (
    <View style={{ flex: 1, backgroundColor: bg, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }}>
      <View style={{
        width: 72, height: 72, borderRadius: 22,
        backgroundColor: "#EF444415", borderWidth: 1, borderColor: "#EF444430",
        alignItems: "center", justifyContent: "center", marginBottom: 20,
      }}>
        <Ionicons name="cloud-offline-outline" size={32} color="#EF4444" />
      </View>
      <Text style={{ color: textPrimary, fontSize: 18, fontWeight: "700", marginBottom: 8, textAlign: "center" }}>
        Sin conexión
      </Text>
      <Text style={{ color: textSub, fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 28 }}>
        No se pudieron cargar los datos del dashboard.{"\n"}Verifica tu conexión e intenta de nuevo.
      </Text>
      <TouchableOpacity
        onPress={onRetry}
        disabled={isRetrying}
        style={{
          backgroundColor: "#7C3AED",
          paddingHorizontal: 32, paddingVertical: 13,
          borderRadius: 14,
          flexDirection: "row", alignItems: "center", gap: 8,
          opacity: isRetrying ? 0.7 : 1,
        }}
        activeOpacity={0.8}
      >
        {isRetrying ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="refresh-outline" size={16} color="#fff" />
        )}
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
          {isRetrying ? "Cargando..." : "Reintentar"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function BranchHealthRow({ branch, last }: { branch: BranchHealthSummary; last: boolean }) {
  const { iconMuted: fallbackColor } = useAppTheme();
  const rawStyle = getHealthStyle(branch.status);
  const s = rawStyle.color === "#4A4A5C" ? { ...rawStyle, color: fallbackColor } : rawStyle;
  const lastSeen = branch.lastCheckedAt ? timeAgo(branch.lastCheckedAt) : null;

  return (
    <View className={`flex-row items-center px-4 py-3 gap-3 ${!last ? "border-b border-dark-border" : ""}`}>
      <View className={`w-8 h-8 rounded-xl items-center justify-center ${s.bg} border ${s.border}`}>
        <Ionicons name={s.icon} size={14} color={s.color} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-content-primary text-sm font-semibold" numberOfLines={1}>{branch.branchName}</Text>
        <Text className="text-content-muted text-xs" numberOfLines={1}>{branch.clientName}</Text>
      </View>
      <View className="items-end gap-0.5">
        <View className={`px-2 py-0.5 rounded-full ${s.bg} border ${s.border}`}>
          <Text className="text-[10px] font-bold" style={{ color: s.color }}>{s.label}</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          {branch.latencyMs !== null && (
            <Text className="text-content-muted text-[10px]">{branch.latencyMs}ms</Text>
          )}
          {branch.openIncidents > 0 && (
            <View className="flex-row items-center gap-0.5">
              <Ionicons name="alert-circle-outline" size={10} color="#EF4444" />
              <Text className="text-red-400 text-[10px] font-semibold">{branch.openIncidents}</Text>
            </View>
          )}
          {lastSeen && !branch.latencyMs && !branch.openIncidents && (
            <Text className="text-content-muted text-[10px]">{lastSeen}</Text>
          )}
        </View>
      </View>
    </View>
  );
}
