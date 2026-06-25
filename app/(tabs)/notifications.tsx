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
import { getCard } from "@/api/kanban.api";
import { router } from "expo-router";
import { timeAgo } from "@/utils/timeAgo";
import { useAppTheme } from "@/hooks/useAppTheme";

/* ─── Types ─── */

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: string;
  metadata: Record<string, string>;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

/* ─── Icon map — covers all types emitted by the backend ─── */

type IconConfig = { name: keyof typeof Ionicons.glyphMap; color: string };

const TYPE_ICON: Record<string, IconConfig> = {
  // Tickets
  TICKET_ASSIGNED:           { name: "ticket-outline",           color: "#7C3AED" },
  TICKET_ESCALATED:          { name: "arrow-up-circle-outline",  color: "#F97316" },
  TICKET_SLA_BREACHED:       { name: "timer-outline",            color: "#EF4444" },
  TICKET_STATUS_CHANGED:     { name: "refresh-circle-outline",   color: "#3B82F6" },
  SLA_WARNING:               { name: "alert-circle-outline",     color: "#EF4444" },
  CSAT_RESPONSE_RECEIVED:    { name: "star-outline",             color: "#FBBF24" },
  CSAT_LOW_SCORE:            { name: "thumbs-down-outline",      color: "#EF4444" },
  POS_TICKET:                { name: "storefront-outline",       color: "#F97316" },
  POS_CHAT:                  { name: "chatbubble-outline",       color: "#3B82F6" },
  CHAT_CONVERSATION_STARTED: { name: "chatbubble-ellipses-outline", color: "#3B82F6" },
  // Kanban
  CARD_DUE_SOON:             { name: "albums-outline",           color: "#FBBF24" },
  CARD_OVERDUE:              { name: "albums-outline",           color: "#EF4444" },
  ESTIMATE_EXCEEDED:         { name: "time-outline",             color: "#F97316" },
  // Finance
  INVOICE_DUE_SOON:          { name: "receipt-outline",          color: "#FBBF24" },
  INVOICE_OVERDUE:           { name: "receipt-outline",          color: "#EF4444" },
  // CRM
  CLIENT_MOVED:              { name: "business-outline",         color: "#3B82F6" },
  BRANCH_MOVED:              { name: "location-outline",         color: "#3B82F6" },
  OPPORTUNITY_STAGE_CHANGED: { name: "trending-up-outline",      color: "#7C3AED" },
  OPPORTUNITY_WON:           { name: "trophy-outline",           color: "#34D399" },
  OPPORTUNITY_LOST:          { name: "close-circle-outline",     color: "#EF4444" },
  PROSPECT_CONVERTED:        { name: "person-add-outline",       color: "#34D399" },
  PROSPECT_LOST:             { name: "person-remove-outline",    color: "#EF4444" },
  CONTACT_ASSIGNED:          { name: "person-outline",           color: "#7C3AED" },
  // System / Health
  HEALTH_INCIDENT:           { name: "pulse-outline",            color: "#EF4444" },
  HEALTH_INCIDENT_RESOLVED:  { name: "checkmark-circle-outline", color: "#34D399" },
  LICENSE_EXPIRING_SOON:     { name: "key-outline",              color: "#FBBF24" },
  WEBHOOK_FAILED:            { name: "code-slash-outline",       color: "#EF4444" },
  // Calendar / Reminders
  CALENDAR_ASSIGNED:         { name: "calendar-outline",         color: "#7C3AED" },
  CALENDAR_UPDATED:          { name: "calendar-outline",         color: "#3B82F6" },
  CALENDAR_REMOVED:          { name: "calendar-outline",         color: "#EF4444" },
  CLIENT_REMINDER_DUE:       { name: "alarm-outline",            color: "#FBBF24" },
  CLIENT_REMINDER_COMPLETED: { name: "checkmark-done-outline",   color: "#34D399" },
  CLIENT_REMINDER_SNOOZED:   { name: "pause-circle-outline",     color: "#8888A0" },
};

/* ─── Navigation helpers ─── */

function navToTicket(ticketId: string) {
  router.push({ pathname: "/(tabs)/tickets/[id]", params: { id: ticketId } });
}

function navToCard(boardId: string, cardId: string) {
  router.push({
    pathname: "/(tabs)/kanban/[boardId]",
    params: { boardId, initialCardId: cardId },
  });
}

async function resolveBoardId(cardId: string): Promise<string | null> {
  try {
    const card = await getCard(cardId);
    return card.boardId ?? null;
  } catch {
    return null;
  }
}

async function navigateFromNotification(item: NotificationItem) {
  const meta = (item.metadata as Record<string, string>) ?? {};

  // ESTIMATE_EXCEEDED — entityType distinguishes ticket vs card
  if (item.type === "ESTIMATE_EXCEEDED") {
    if (meta.entityType === "TICKET" && meta.entityId) {
      navToTicket(meta.entityId);
    } else if (meta.entityType === "CARD" && meta.entityId) {
      const boardId = meta.boardId ?? (await resolveBoardId(meta.entityId));
      if (boardId) navToCard(boardId, meta.entityId);
      else router.push("/(tabs)/kanban");
    }
    return;
  }

  // Live chat: navigate directly to the conversation
  if (item.type === "CHAT_CONVERSATION_STARTED" && meta.conversationId) {
    router.push({ pathname: "/(tabs)/chat/[id]", params: { id: meta.conversationId } });
    return;
  }

  // Any notification that carries a ticketId:
  // TICKET_ASSIGNED, TICKET_ESCALATED, TICKET_STATUS_CHANGED, TICKET_SLA_BREACHED,
  // TICKET_NEW_COMMENT, TICKET_CLOSED, TICKET_CREATED, TICKET_RESTORED,
  // SLA_WARNING, TICKET_AUTO_ASSIGNED, TICKET_BULK_ASSIGN, TICKET_BULK_STATUS,
  // POS_TICKET, POS_CHAT, CSAT_RESPONSE_RECEIVED, CSAT_LOW_SCORE
  if (meta.ticketId) {
    navToTicket(meta.ticketId);
    return;
  }

  // Kanban card types: CARD_DUE_SOON, CARD_OVERDUE
  if (meta.cardId) {
    const boardId = meta.boardId ?? (await resolveBoardId(meta.cardId));
    if (boardId) {
      navToCard(boardId, meta.cardId);
    } else {
      // boardId unavailable (notification created before backend fix) — go to kanban tab
      router.push("/(tabs)/kanban");
    }
    return;
  }

  // Health incidents — no dedicated screen, go to dashboard for context
  if (item.type === "HEALTH_INCIDENT" || item.type === "HEALTH_INCIDENT_RESOLVED") {
    router.push("/(tabs)");
    return;
  }

  // INVOICE_*, CLIENT_MOVED, OPPORTUNITY_*, PROSPECT_*, CONTACT_ASSIGNED,
  // CALENDAR_*, CLIENT_REMINDER_*, LICENSE_*, WEBHOOK_FAILED, BRANCH_MOVED —
  // no corresponding screen in the mobile app yet; just mark as read.
}

/* ─── Screen ─── */

export default function NotificationsScreen() {
  const qc = useQueryClient();
  const { barStyle, statusBarBg, iconMuted: iconM, iconEmpty } = useAppTheme();

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<NotificationItem[]> => {
      const res = await apiClient.get("/api/v1/notifications", {
        params: { page: 0, size: 50 },
      });
      // apiClient interceptor unwraps ApiResponse.data → PageResponse.
      // Access .content to get the notification array.
      return res.data?.content ?? [];
    },
    retry: false,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/api/v1/notifications/${id}/read`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      const prev = qc.getQueryData<NotificationItem[]>(["notifications"]);
      qc.setQueryData<NotificationItem[]>(["notifications"], (old) =>
        (old ?? []).map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["notifications"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => apiClient.patch("/api/v1/notifications/read-all"),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      const prev = qc.getQueryData<NotificationItem[]>(["notifications"]);
      qc.setQueryData<NotificationItem[]>(["notifications"], (old) =>
        (old ?? []).map((n) => ({ ...n, read: true }))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["notifications"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  function handleTap(item: NotificationItem) {
    if (!item.read) markRead.mutate(item.id);
    navigateFromNotification(item).catch(() => {});
  }

  const unreadCount = (data ?? []).filter((n) => !n.read).length;

  return (
    <View className="flex-1 bg-dark-bg">
      <StatusBar barStyle={barStyle} backgroundColor={statusBarBg} />

      {/* Header */}
      <View className="bg-dark-surface border-b border-dark-border px-4 pt-16 pb-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2.5">
            <Text className="text-content-primary text-xl font-bold">Alertas</Text>
            {unreadCount > 0 && (
              <View className="bg-brand px-2.5 py-0.5 rounded-full">
                <Text className="text-white text-xs font-bold">{unreadCount} nuevas</Text>
              </View>
            )}
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity
              onPress={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="flex-row items-center gap-1.5 py-1.5 px-3 rounded-xl bg-dark-raised border border-dark-border"
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-done-outline" size={14} color="#7C3AED" />
              <Text className="text-brand-light text-xs font-semibold">Leer todo</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#7C3AED" />
        }
        renderItem={({ item }) => {
          const icon: IconConfig = TYPE_ICON[item.type] ?? {
            name: "notifications-outline" as const,
            color: iconM,
          };
          return (
            <TouchableOpacity
              onPress={() => handleTap(item)}
              className={`mx-3 my-1.5 rounded-2xl border p-4 flex-row gap-3 items-start ${
                item.read
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
                      item.read ? "text-content-secondary" : "text-content-primary"
                    }`}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  {!item.read && (
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
          !isFetching ? (
            <View className="items-center justify-center py-24">
              <Ionicons name="notifications-off-outline" size={48} color={iconEmpty} />
              <Text className="text-content-muted text-sm mt-3">Sin notificaciones</Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingVertical: 8 }}
      />
    </View>
  );
}
