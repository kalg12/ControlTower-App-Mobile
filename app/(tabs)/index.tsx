import { View, Text, ScrollView, RefreshControl, StatusBar } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuthStore } from "@/stores/auth.store";
import { useTicketStats } from "@/queries/tickets.queries";

interface DashboardStats {
  openTickets: number;
  criticalTickets: number;
  resolvedToday: number;
  avgResolutionHours: number;
}

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

  const isLoading = statsLoading || dashLoading;
  const refetch = () => { refetchStats(); refetchDash(); };

  const initials = user?.fullName
    ?.split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("") ?? "?";

  return (
    <ScrollView
      className="flex-1 bg-dark-bg"
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#7C3AED" />
      }
    >
      <StatusBar barStyle="light-content" backgroundColor="#0C0C14" />

      {/* Header */}
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
      </View>

      <View className="p-4 gap-3">
        {/* Stats from /tickets/stats */}
        {stats && (
          <>
            <Text className="text-content-secondary text-xs font-semibold uppercase tracking-wider px-1 mb-1">
              Estado de tickets
            </Text>
            <View className="flex-row gap-3">
              <StatCard
                label="Abiertos"
                value={stats.byStatus.OPEN ?? 0}
                color="text-blue-400"
                bg="bg-blue-500/10"
                border="border-blue-500/20"
              />
              <StatCard
                label="En progreso"
                value={stats.byStatus.IN_PROGRESS ?? 0}
                color="text-amber-400"
                bg="bg-amber-500/10"
                border="border-amber-500/20"
              />
            </View>
            <View className="flex-row gap-3">
              <StatCard
                label="En espera"
                value={stats.byStatus.WAITING ?? 0}
                color="text-yellow-400"
                bg="bg-yellow-500/10"
                border="border-yellow-500/20"
              />
              <StatCard
                label="Resueltos"
                value={stats.byStatus.RESOLVED ?? 0}
                color="text-emerald-400"
                bg="bg-emerald-500/10"
                border="border-emerald-500/20"
              />
            </View>

            <View className="bg-dark-surface border border-dark-border rounded-2xl p-4 flex-row justify-between items-center mt-1">
              <Text className="text-content-secondary text-sm">Total tickets</Text>
              <Text className="text-content-primary text-2xl font-bold">{stats.total}</Text>
            </View>
          </>
        )}

        {/* Dashboard metrics */}
        {dash && (
          <>
            <Text className="text-content-secondary text-xs font-semibold uppercase tracking-wider px-1 mt-2 mb-1">
              Métricas del día
            </Text>
            <View className="bg-dark-surface border border-dark-border rounded-2xl p-4 flex-row justify-between items-center">
              <Text className="text-content-secondary text-sm">Resueltos hoy</Text>
              <Text className="text-emerald-400 text-2xl font-bold">{dash.resolvedToday}</Text>
            </View>
            <View className="bg-dark-surface border border-dark-border rounded-2xl p-4 flex-row justify-between items-center">
              <Text className="text-content-secondary text-sm">Tiempo promedio resolución</Text>
              <Text className="text-brand-light text-xl font-bold">
                {dash.avgResolutionHours?.toFixed(1)}h
              </Text>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  color,
  bg,
  border,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
  border: string;
}) {
  return (
    <View className={`flex-1 ${bg} border ${border} rounded-2xl p-4`}>
      <Text className={`text-3xl font-bold ${color}`}>{value}</Text>
      <Text className="text-content-secondary text-xs mt-1">{label}</Text>
    </View>
  );
}
