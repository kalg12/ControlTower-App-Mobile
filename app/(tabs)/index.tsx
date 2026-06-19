import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StatusBar,
  TouchableOpacity,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiClient } from "@/api/client";
import { useAuthStore } from "@/stores/auth.store";
import { useTicketStats } from "@/queries/tickets.queries";
import { TicketStatus } from "@/types/ticket";

/* ─── Types ─── */

interface DashboardStats {
  openTickets: number;
  criticalTickets: number;
  resolvedToday: number;
  avgResolutionHours: number | null;
}

interface BranchHealthSummary {
  branchId: string;
  branchName: string;
  clientName: string;
  status: "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN";
  latencyMs: number | null;
  version: string | null;
  lastCheckedAt: string | null;
  openIncidents: number;
  errorMessage: string | null;
}

/* ─── Helpers ─── */

function formatResolutionTime(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "Sin datos";
  if (hours === 0) return "Sin datos";
  if (hours < 1 / 60) return "< 1m";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function goToTickets(status: TicketStatus) {
  router.push({ pathname: "/(tabs)/tickets", params: { initialStatus: status } });
}

const HEALTH_STATUS: Record<
  BranchHealthSummary["status"],
  { label: string; color: string; bg: string; border: string; icon: string }
> = {
  HEALTHY:  { label: "Saludable",  color: "#34D399", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: "checkmark-circle" },
  DEGRADED: { label: "Degradado",  color: "#F97316", bg: "bg-orange-500/10",  border: "border-orange-500/20",  icon: "warning" },
  CRITICAL: { label: "Crítico",    color: "#EF4444", bg: "bg-red-500/10",     border: "border-red-500/20",     icon: "alert-circle" },
  UNKNOWN:  { label: "Desconocido", color: "#4A4A5C", bg: "bg-dark-raised",   border: "border-dark-border",    icon: "help-circle" },
};

/* ─── Screen ─── */

export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useTicketStats();

  const { data: dash, isLoading: dashLoading, refetch: refetchDash } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async (): Promise<DashboardStats> => {
      const res = await apiClient.get("/api/v1/dashboard");
      return res.data;
    },
    retry: false,
  });

  const { data: healthList, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
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

  function handleRefresh() {
    refetchStats();
    refetchDash();
    refetchHealth();
  }

  const initials =
    user?.fullName
      ?.split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("") ?? "?";

  const healthCritical = (healthList ?? []).filter((b) => b.status === "CRITICAL").length;
  const healthDegraded = (healthList ?? []).filter((b) => b.status === "DEGRADED").length;

  return (
    <ScrollView
      className="flex-1 bg-dark-bg"
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor="#7C3AED" />
      }
    >
      <StatusBar barStyle="light-content" backgroundColor="#0C0C14" />

      {/* ── Header ── */}
      <View className="bg-dark-surface border-b border-dark-border px-5 pt-16 pb-5">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-content-secondary text-sm">Bienvenido de vuelta</Text>
            <Text className="text-content-primary text-xl font-bold mt-0.5">
              {user?.fullName ?? "Agente"}
            </Text>
          </View>
          <View className="w-10 h-10 rounded-full bg-brand items-center justify-center">
            <Text className="text-white font-bold text-sm">{initials}</Text>
          </View>
        </View>

        {/* Alert banner: critical branches */}
        {healthCritical > 0 && (
          <View className="mt-3 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 flex-row items-center gap-2">
            <Ionicons name="alert-circle" size={16} color="#EF4444" />
            <Text className="text-red-400 text-xs font-semibold flex-1">
              {healthCritical} sucursal{healthCritical > 1 ? "es" : ""} en estado CRÍTICO
            </Text>
          </View>
        )}
      </View>

      <View className="p-4 gap-3">

        {/* ── Ticket status grid ── */}
        {stats && (
          <>
            <SectionHeader
              title="Estado de tickets"
              action={{ label: "Ver todos", onPress: () => router.push("/(tabs)/tickets") }}
            />

            <View className="flex-row gap-3">
              <StatCard
                label="Abiertos"
                value={stats.byStatus.OPEN ?? 0}
                color="text-blue-400"
                bg="bg-blue-500/10"
                border="border-blue-500/20"
                icon="mail-open-outline"
                iconColor="#60A5FA"
                onPress={() => goToTickets("OPEN")}
              />
              <StatCard
                label="En progreso"
                value={stats.byStatus.IN_PROGRESS ?? 0}
                color="text-amber-400"
                bg="bg-amber-500/10"
                border="border-amber-500/20"
                icon="play-circle-outline"
                iconColor="#FBBF24"
                onPress={() => goToTickets("IN_PROGRESS")}
              />
            </View>

            <View className="flex-row gap-3">
              <StatCard
                label="En espera"
                value={stats.byStatus.WAITING ?? 0}
                color="text-yellow-400"
                bg="bg-yellow-500/10"
                border="border-yellow-500/20"
                icon="pause-circle-outline"
                iconColor="#FDE047"
                onPress={() => goToTickets("WAITING")}
              />
              <StatCard
                label="Resueltos"
                value={stats.byStatus.RESOLVED ?? 0}
                color="text-emerald-400"
                bg="bg-emerald-500/10"
                border="border-emerald-500/20"
                icon="checkmark-circle-outline"
                iconColor="#34D399"
                onPress={() => goToTickets("RESOLVED")}
              />
            </View>

            <TouchableOpacity
              onPress={() => router.push("/(tabs)/tickets")}
              className="bg-dark-surface border border-dark-border rounded-2xl p-4 flex-row justify-between items-center"
              activeOpacity={0.7}
            >
              <View className="flex-row items-center gap-2">
                <Ionicons name="ticket-outline" size={18} color="#8888A0" />
                <Text className="text-content-secondary text-sm">Total tickets</Text>
              </View>
              <View className="flex-row items-center gap-2">
                <Text className="text-content-primary text-2xl font-bold">{stats.total}</Text>
                <Ionicons name="chevron-forward" size={16} color="#4A4A5C" />
              </View>
            </TouchableOpacity>
          </>
        )}

        {/* ── Dashboard metrics ── */}
        {dash && (
          <>
            <SectionHeader title="Métricas del día" />
            <View className="flex-row gap-3">
              <View className="flex-1 bg-dark-surface border border-dark-border rounded-2xl p-4">
                <Ionicons name="checkmark-done-outline" size={18} color="#34D399" />
                <Text className="text-emerald-400 text-2xl font-bold mt-2">{dash.resolvedToday}</Text>
                <Text className="text-content-secondary text-xs mt-0.5">Resueltos hoy</Text>
              </View>
              <View className="flex-1 bg-dark-surface border border-dark-border rounded-2xl p-4">
                <Ionicons name="time-outline" size={18} color="#A78BFA" />
                <Text className="text-brand-light text-2xl font-bold mt-2">
                  {formatResolutionTime(dash.avgResolutionHours)}
                </Text>
                <Text className="text-content-secondary text-xs mt-0.5">Tiempo promedio</Text>
              </View>
            </View>

            {(dash.criticalTickets ?? 0) > 0 && (
              <TouchableOpacity
                onPress={() => goToTickets("OPEN")}
                className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex-row items-center justify-between"
                activeOpacity={0.7}
              >
                <View className="flex-row items-center gap-2">
                  <Ionicons name="warning-outline" size={18} color="#EF4444" />
                  <Text className="text-red-400 font-semibold text-sm">Tickets críticos</Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-red-400 text-xl font-bold">{dash.criticalTickets}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#EF4444" />
                </View>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ── Health monitoring ── */}
        {(healthList ?? []).length > 0 && (
          <>
            <SectionHeader title="Estado de sucursales">
              {(healthCritical > 0 || healthDegraded > 0) && (
                <View className="flex-row items-center gap-1.5">
                  {healthCritical > 0 && (
                    <View className="bg-red-500/15 border border-red-500/30 px-2 py-0.5 rounded-full flex-row items-center gap-1">
                      <Ionicons name="alert-circle" size={10} color="#EF4444" />
                      <Text className="text-[10px] text-red-400 font-bold">{healthCritical} críticas</Text>
                    </View>
                  )}
                  {healthDegraded > 0 && (
                    <View className="bg-orange-500/15 border border-orange-500/30 px-2 py-0.5 rounded-full flex-row items-center gap-1">
                      <Ionicons name="warning" size={10} color="#F97316" />
                      <Text className="text-[10px] text-orange-400 font-bold">{healthDegraded} degradadas</Text>
                    </View>
                  )}
                </View>
              )}
            </SectionHeader>

            <View className="bg-dark-surface border border-dark-border rounded-2xl overflow-hidden">
              {(healthList ?? []).slice(0, 8).map((branch, idx, arr) => (
                <BranchHealthRow
                  key={branch.branchId}
                  branch={branch}
                  last={idx === arr.length - 1}
                />
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
          <QuickAction
            icon="mail-outline"
            label="Abiertos"
            color="#60A5FA"
            onPress={() => goToTickets("OPEN")}
          />
          <QuickAction
            icon="alert-circle-outline"
            label="SLA en riesgo"
            color="#F97316"
            onPress={() => router.push({ pathname: "/(tabs)/tickets", params: { slaAtRisk: "true" } })}
          />
          <QuickAction
            icon="person-outline"
            label="Asignados a mí"
            color="#7C3AED"
            onPress={() =>
              router.push({
                pathname: "/(tabs)/tickets",
                params: { assigneeId: user?.id ?? "" },
              })
            }
          />
        </View>
      </View>
    </ScrollView>
  );
}

/* ─── Sub-components ─── */

function SectionHeader({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  children?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between px-1 mb-0.5 mt-1">
      <Text className="text-content-secondary text-xs font-semibold uppercase tracking-wider">
        {title}
      </Text>
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

function StatCard({
  label,
  value,
  color,
  bg,
  border,
  icon,
  iconColor,
  onPress,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
  border: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`flex-1 ${bg} border ${border} rounded-2xl p-4`}
      activeOpacity={0.7}
    >
      <View className="flex-row items-center justify-between mb-2">
        <Ionicons name={icon} size={16} color={iconColor} />
        <Ionicons name="chevron-forward" size={12} color={iconColor} style={{ opacity: 0.5 }} />
      </View>
      <Text className={`text-3xl font-bold ${color}`}>{value}</Text>
      <Text className="text-content-secondary text-xs mt-1">{label}</Text>
    </TouchableOpacity>
  );
}

function QuickAction({
  icon,
  label,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-1 bg-dark-surface border border-dark-border rounded-2xl p-3 items-center gap-2"
      activeOpacity={0.7}
    >
      <View
        className="w-10 h-10 rounded-xl items-center justify-center"
        style={{ backgroundColor: color + "22" }}
      >
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text className="text-content-muted text-[10px] text-center leading-3">{label}</Text>
    </TouchableOpacity>
  );
}

function BranchHealthRow({
  branch,
  last,
}: {
  branch: BranchHealthSummary;
  last: boolean;
}) {
  const s = HEALTH_STATUS[branch.status] ?? HEALTH_STATUS.UNKNOWN;

  return (
    <View
      className={`flex-row items-center px-4 py-3 gap-3 ${!last ? "border-b border-dark-border" : ""}`}
    >
      {/* Status indicator */}
      <View
        className={`w-8 h-8 rounded-xl items-center justify-center ${s.bg} border ${s.border}`}
      >
        <Ionicons name={s.icon as keyof typeof Ionicons.glyphMap} size={14} color={s.color} />
      </View>

      {/* Branch + client info */}
      <View className="flex-1 min-w-0">
        <Text className="text-content-primary text-sm font-semibold" numberOfLines={1}>
          {branch.branchName}
        </Text>
        <Text className="text-content-muted text-xs" numberOfLines={1}>
          {branch.clientName}
        </Text>
      </View>

      {/* Right side: latency + incidents + status pill */}
      <View className="items-end gap-1">
        <View
          className={`px-2 py-0.5 rounded-full ${s.bg} border ${s.border}`}
        >
          <Text className="text-[10px] font-bold" style={{ color: s.color }}>
            {s.label}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          {branch.latencyMs !== null && (
            <Text className="text-content-muted text-[10px]">{branch.latencyMs}ms</Text>
          )}
          {branch.openIncidents > 0 && (
            <View className="flex-row items-center gap-0.5">
              <Ionicons name="alert-circle-outline" size={10} color="#EF4444" />
              <Text className="text-red-400 text-[10px] font-semibold">{branch.openIncidents}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
