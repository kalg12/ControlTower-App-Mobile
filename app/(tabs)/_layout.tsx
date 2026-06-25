import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAppTheme } from "@/hooks/useAppTheme";
import { apiClient } from "@/api/client";

function useUnreadCount(): number | undefined {
  const { data } = useQuery<{ read: boolean }[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/notifications", {
        params: { page: 0, size: 50 },
      });
      return res.data?.content ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const count = (data ?? []).filter((n) => !n.read).length;
  return count > 0 ? count : undefined;
}

export default function TabsLayout() {
  usePushNotifications();
  const { tabBarBg, tabBarBorder, tabBarInactive } = useAppTheme();
  const unreadCount = useUnreadCount();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#7C3AED",
        tabBarInactiveTintColor: tabBarInactive,
        tabBarStyle: {
          backgroundColor: tabBarBg,
          borderTopColor: tabBarBorder,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: "Tickets",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ticket-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="kanban"
        options={{
          title: "Kanban",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="albums-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alertas",
          tabBarBadge: unreadCount,
          tabBarBadgeStyle: { backgroundColor: "#EF4444", fontSize: 10 },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Ajustes",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
