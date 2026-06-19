import { View, Text, FlatList, RefreshControl, TouchableOpacity } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

export default function NotificationsScreen() {
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<PushNotificationItem[]> => {
      const res = await apiClient.get("/api/v1/mobile/notifications");
      return res.data;
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.patch(`/api/v1/mobile/notifications/${id}/read`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  function handleTap(item: PushNotificationItem) {
    if (!item.readAt) markRead.mutate(item.id);
    if (item.data.ticketId) {
      router.push(`/(tabs)/tickets/${item.data.ticketId}`);
    }
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white border-b border-gray-200 px-4 pt-16 pb-4">
        <Text className="text-xl font-bold text-gray-900">Notificaciones</Text>
      </View>

      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => handleTap(item)}
            className={`mx-4 my-1 rounded-2xl p-4 shadow-sm ${item.readAt ? "bg-white" : "bg-brand/5 border border-brand/20"}`}
          >
            {!item.readAt && (
              <View className="absolute top-4 right-4 w-2 h-2 rounded-full bg-brand" />
            )}
            <Text className="font-semibold text-gray-900 text-sm pr-4">{item.title}</Text>
            <Text className="text-gray-600 text-sm mt-1" numberOfLines={2}>{item.body}</Text>
            <Text className="text-gray-400 text-xs mt-2">
              {timeAgo(item.createdAt)}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View className="items-center justify-center py-24">
            <Text className="text-4xl mb-3">🔔</Text>
            <Text className="text-gray-500 text-base">Sin notificaciones</Text>
          </View>
        }
        contentContainerStyle={{ paddingVertical: 8 }}
      />
    </View>
  );
}
