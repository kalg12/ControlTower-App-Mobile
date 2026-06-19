import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuthStore } from "@/stores/auth.store";

interface DashboardStats {
  openTickets: number;
  criticalTickets: number;
  resolvedToday: number;
  avgResolutionHours: number;
}

export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async (): Promise<DashboardStats> => {
      const res = await apiClient.get("/api/v1/dashboard");
      return res.data;
    },
  });

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
    >
      <View className="bg-brand px-6 pt-16 pb-8">
        <Text className="text-white/80 text-sm">Bienvenido,</Text>
        <Text className="text-white text-2xl font-bold">{user?.fullName ?? "Agente"}</Text>
      </View>

      <View className="p-4 gap-4">
        <StatCard label="Tickets abiertos" value={data?.openTickets ?? "—"} accent="text-blue-600" />
        <StatCard label="Críticos" value={data?.criticalTickets ?? "—"} accent="text-red-600" />
        <StatCard label="Resueltos hoy" value={data?.resolvedToday ?? "—"} accent="text-green-600" />
        <StatCard
          label="Tiempo promedio resolución"
          value={data?.avgResolutionHours != null ? `${data.avgResolutionHours.toFixed(1)}h` : "—"}
          accent="text-brand"
        />
      </View>
    </ScrollView>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <View className="bg-white rounded-2xl p-5 shadow-sm">
      <Text className="text-gray-500 text-sm mb-1">{label}</Text>
      <Text className={`text-3xl font-bold ${accent}`}>{value}</Text>
    </View>
  );
}
