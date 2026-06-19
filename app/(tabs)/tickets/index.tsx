import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useState, useCallback } from "react";
import { router } from "expo-router";
import { useInfiniteTickets } from "@/queries/tickets.queries";
import { Ticket, TicketStatus, TicketPriority } from "@/types/ticket";
import { timeAgo } from "@/utils/timeAgo";

const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En progreso",
  WAITING: "En espera",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
};

const STATUS_COLORS: Record<TicketStatus, string> = {
  OPEN: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-orange-100 text-orange-700",
  WAITING: "bg-yellow-100 text-yellow-700",
  RESOLVED: "bg-green-100 text-green-700",
  CLOSED: "bg-gray-100 text-gray-600",
};

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  CRITICAL: "bg-red-500",
  HIGH: "bg-orange-400",
  MEDIUM: "bg-yellow-400",
  LOW: "bg-gray-300",
};

const STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED"];

export default function TicketListScreen() {
  const [search, setSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState<TicketStatus | undefined>("OPEN");

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, refetch } =
    useInfiniteTickets({ status: activeStatus });

  const tickets = data?.pages.flatMap((p) => p.content) ?? [];

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const filtered = search.trim()
    ? tickets.filter(
        (t) =>
          t.title.toLowerCase().includes(search.toLowerCase()) ||
          t.requesterEmail?.toLowerCase().includes(search.toLowerCase())
      )
    : tickets;

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white border-b border-gray-200 px-4 pt-16 pb-3">
        <Text className="text-xl font-bold text-gray-900 mb-3">Tickets</Text>
        <TextInput
          className="bg-gray-100 rounded-xl px-4 py-2.5 text-gray-800 text-sm"
          placeholder="Buscar por asunto o cliente..."
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
      </View>

      {/* Status filter tabs */}
      <View className="bg-white border-b border-gray-100 px-4 py-2">
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={STATUSES}
          keyExtractor={(s) => s}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setActiveStatus(item === activeStatus ? undefined : item)}
              className={`mr-2 px-3 py-1.5 rounded-full ${
                activeStatus === item ? "bg-brand" : "bg-gray-100"
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  activeStatus === item ? "text-white" : "text-gray-600"
                }`}
              >
                {STATUS_LABELS[item]}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        renderItem={({ item }) => <TicketCard ticket={item} />}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator color="#F96E1B" className="py-4" />
          ) : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <View className="items-center justify-center py-24">
              <Text className="text-4xl mb-3">📋</Text>
              <Text className="text-gray-500">No hay tickets</Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingVertical: 8 }}
      />
    </View>
  );
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <TouchableOpacity
      onPress={() => router.push({ pathname: "/(tabs)/tickets/[id]", params: { id: ticket.id } })}
      className="mx-4 my-1 bg-white rounded-2xl p-4 shadow-sm"
    >
      <View className="flex-row items-center mb-2">
        <View className={`w-2 h-2 rounded-full mr-2 ${PRIORITY_COLORS[ticket.priority]}`} />
        <View className={`px-2 py-0.5 rounded-full ${STATUS_COLORS[ticket.status]}`}>
          <Text className={`text-xs font-medium ${STATUS_COLORS[ticket.status].split(" ")[1]}`}>
            {STATUS_LABELS[ticket.status]}
          </Text>
        </View>
        <Text className="ml-auto text-gray-400 text-xs">{timeAgo(ticket.createdAt)}</Text>
      </View>
      <Text className="text-gray-900 font-semibold text-sm mb-1" numberOfLines={2}>
        {ticket.title}
      </Text>
      {ticket.requesterEmail && (
        <Text className="text-gray-500 text-xs">{ticket.requesterEmail}</Text>
      )}
    </TouchableOpacity>
  );
}
