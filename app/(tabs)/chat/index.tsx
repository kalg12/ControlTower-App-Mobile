import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useConversations, useClaimConversation } from "@/queries/chat.queries";
import { ChatConversation, ConversationStatus } from "@/types/chat";
import { timeAgo } from "@/utils/timeAgo";
import { useAppTheme } from "@/hooks/useAppTheme";

const TABS: { label: string; status: ConversationStatus }[] = [
  { label: "En espera", status: "WAITING" },
  { label: "Activos", status: "ACTIVE" },
  { label: "Cerrados", status: "CLOSED" },
];

export default function ChatInboxScreen() {
  const { barStyle, statusBarBg, iconMuted, iconSecondary, iconEmpty } = useAppTheme();
  const [activeTab, setActiveTab] = useState<ConversationStatus>("WAITING");

  const { data, isLoading, refetch, isRefetching, fetchNextPage, hasNextPage } =
    useConversations(activeTab);
  const claimConversation = useClaimConversation();

  const conversations = data?.pages.flatMap((p) => p.content) ?? [];

  function handleClaim(c: ChatConversation) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    claimConversation.mutate(c.id, {
      onSuccess: () => router.push(`/(tabs)/chat/${c.id}`),
    });
  }

  return (
    <View className="flex-1 bg-dark-bg">
      <StatusBar barStyle={barStyle} backgroundColor={statusBarBg} />

      {/* Header */}
      <View className="bg-dark-surface border-b border-dark-border pt-14 pb-0">
        <View className="px-4 pb-3">
          <Text className="text-content-primary font-bold text-2xl">Chat en vivo</Text>
        </View>

        {/* Status tabs */}
        <View className="flex-row border-t border-dark-border">
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.status}
              onPress={() => setActiveTab(t.status)}
              className={`flex-1 py-3 items-center border-b-2 ${
                activeTab === t.status ? "border-brand" : "border-transparent"
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  activeTab === t.status ? "text-brand-light" : "text-content-muted"
                }`}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#7C3AED" size="large" />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#7C3AED" />
          }
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.3}
          renderItem={({ item }) => (
            <ConversationCard
              conversation={item}
              onPress={() => router.push(`/(tabs)/chat/${item.id}`)}
              onClaim={() => handleClaim(item)}
              isClaiming={claimConversation.isPending && claimConversation.variables === item.id}
              iconMuted={iconMuted}
              iconSecondary={iconSecondary}
            />
          )}
          ListEmptyComponent={
            <View className="items-center py-20">
              <Ionicons name="chatbubble-ellipses-outline" size={48} color={iconEmpty} />
              <Text className="text-content-muted text-sm mt-3">Sin conversaciones</Text>
              <Text className="text-content-muted text-xs mt-1">
                {activeTab === "WAITING"
                  ? "No hay visitantes esperando"
                  : activeTab === "ACTIVE"
                  ? "No tienes conversaciones activas"
                  : "No hay conversaciones cerradas"}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function ConversationCard({
  conversation: c,
  onPress,
  onClaim,
  isClaiming,
  iconMuted,
  iconSecondary,
}: {
  conversation: ChatConversation;
  onPress: () => void;
  onClaim: () => void;
  isClaiming: boolean;
  iconMuted: string;
  iconSecondary: string;
}) {
  const isWaiting = c.status === "WAITING";
  const lastMsg = c.messages?.[c.messages.length - 1];

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      className="bg-dark-surface border border-dark-border rounded-2xl p-4"
    >
      <View className="flex-row items-start gap-3">
        {/* Avatar */}
        <View className="w-10 h-10 rounded-full bg-brand/20 items-center justify-center">
          <Text className="text-brand-light font-bold text-sm">
            {(c.visitorName ?? c.visitorEmail ?? "?")[0].toUpperCase()}
          </Text>
        </View>

        <View className="flex-1">
          <View className="flex-row items-center justify-between mb-0.5">
            <Text className="text-content-primary font-semibold text-sm flex-1" numberOfLines={1}>
              {c.visitorName ?? c.visitorEmail ?? "Visitante anónimo"}
            </Text>
            <Text className="text-content-muted text-[10px] ml-2">{timeAgo(c.updatedAt)}</Text>
          </View>

          {c.visitorEmail && c.visitorName && (
            <Text className="text-content-muted text-[10px] mb-1">{c.visitorEmail}</Text>
          )}

          {lastMsg ? (
            <Text className="text-content-secondary text-xs leading-4.5" numberOfLines={2}>
              {lastMsg.senderType === "AGENT" ? "Tú: " : ""}
              {lastMsg.content}
            </Text>
          ) : (
            <Text className="text-content-muted text-xs italic">Sin mensajes</Text>
          )}

          <View className="flex-row items-center justify-between mt-2">
            <View className="flex-row items-center gap-2">
              {isWaiting && (
                <View className="bg-amber-500/15 border border-amber-500/30 rounded-full px-2 py-0.5 flex-row items-center gap-1">
                  <View className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <Text className="text-amber-400 text-[10px] font-semibold">Esperando</Text>
                </View>
              )}
              {c.status === "ACTIVE" && (
                <View className="bg-emerald-500/15 border border-emerald-500/30 rounded-full px-2 py-0.5 flex-row items-center gap-1">
                  <View className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <Text className="text-emerald-400 text-[10px] font-semibold">Activo</Text>
                </View>
              )}
              {c.source && (
                <View className="bg-dark-raised border border-dark-border rounded-full px-2 py-0.5">
                  <Text className="text-content-muted text-[10px]">{c.source}</Text>
                </View>
              )}
              {c.unreadCount > 0 && (
                <View className="bg-brand rounded-full w-5 h-5 items-center justify-center">
                  <Text className="text-white text-[10px] font-bold">
                    {c.unreadCount > 9 ? "9+" : c.unreadCount}
                  </Text>
                </View>
              )}
            </View>

            {isWaiting && (
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); onClaim(); }}
                disabled={isClaiming}
                className="flex-row items-center gap-1 bg-brand/15 border border-brand/30 rounded-full px-3 py-1"
              >
                {isClaiming ? (
                  <ActivityIndicator size={10} color="#7C3AED" />
                ) : (
                  <Ionicons name="hand-right-outline" size={12} color="#7C3AED" />
                )}
                <Text className="text-brand-light text-[11px] font-semibold">Tomar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
