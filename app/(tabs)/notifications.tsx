import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { apiClient } from "@/api/client";
import { router } from "expo-router";
import { timeAgo } from "@/utils/timeAgo";

interface PushNotificationItem {
  id: string;
  title: string;
  body: string;
  data: { ticketId?: string; type?: string };
  readAt: string | null;
  createdAt: string;
}

const TYPE_ICON: Record<string, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  TICKET_ASSIGNED:  { name: "ticket-outline",        color: "#7C3AED" },
  TICKET_ESCALATED: { name: "arrow-up-circle-outline", color: "#F97316" },
  SLA_WARNING:      { name: "alert-circle-outline",  color: "#EF4444" },
  NEW_REPLY:        { name: "chatbubble-outline",     color: "#3B82F6" },
};

export default function NotificationsScreen() {
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<PushNotificationItem[]> => {
      const res = await apiClient.get("/api/v1/mobile/notifications");
      return res.data ?? [];
    },
    retry: false,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) =>
      apiClient.patch(`/api/v1/mobile/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  function handleTap(item: PushNotificationItem) {
    if (!item.readAt) markRead.mutate(item.id);
    if (item.data.ticketId) {
      router.push({ pathname: "/(tabs)/tickets/[id]", params: { id: item.data.ticketId } });
    }
  }

  const unreadCount = (data ?? []).filter((n) => !n.readAt).length;

  return (
    <View className="flex-1 bg-dark-bg">
      <StatusBar barStyle="light-content" backgroundColor="#0C0C14" />

      {/* Header */}
      <View className="bg-dark-surface border-b border-dark-border px-4 pt-16 pb-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-content-primary text-xl font-bold">Notificaciones</Text>
          {unreadCount > 0 && (
            <View className="bg-brand px-2.5 py-0.5 rounded-full">
              <Text className="text-white text-xs font-bold">{unreadCount} nuevas</Text>
            </View>
          )}
        </View>
      </View>

      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#7C3AED" />
        }
        renderItem={({ item }) => {
          const icon = TYPE_ICON[item.data.type ?? ""] ?? {
            name: "notifications-outline" as const,
            color: "#4A4A5C",
          };
          return (
            <TouchableOpacity
              onPress={() => handleTap(item)}
              className={`mx-3 my-1.5 rounded-2xl border p-4 flex-row gap-3 items-start ${
                item.readAt
                  ? "bg-dark-surface border-dark-border"
                  : "bg-brand/5 border-brand/30"
              }`}
              activeOpacity={0.7}
            >
              {/* Icon */}
              <View
                className="w-9 h-9 rounded-xl items-center justify-center mt-0.5"
                style={{ backgroundColor: icon.color + "22" }}
              >
                <Ionicons name={icon.name} size={18} color={icon.color} />
              </View>

              {/* Content */}
              <View className="flex-1">
                <View className="flex-row items-start justify-between gap-2">
                  <Text
                    className={`text-sm font-semibold flex-1 ${
                      item.readAt ? "text-content-secondary" : "text-content-primary"
                    }`}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  {!item.readAt && (
                    <View className="w-2 h-2 rounded-full bg-brand mt-1.5" />
                  )}
                </View>
                <Text className="text-content-muted text-xs leading-4 mt-0.5" numberOfLines={2}>
                  {item.body}
                </Text>
                <Text className="text-content-muted text-[10px] mt-1.5">
                  {timeAgo(item.createdAt)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !isLoading ? (
            <View className="items-center justify-center py-24">
              <Ionicons name="notifications-off-outline" size={48} color="#2A2A3C" />
              <Text className="text-content-muted text-sm mt-3">Sin notificaciones</Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingVertical: 8 }}
      />
    </View>
  );
}
