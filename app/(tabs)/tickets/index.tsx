import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { useState, useCallback, useEffect, useRef } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useInfiniteTickets, useTicketStats } from "@/queries/tickets.queries";
import { Ticket, TicketStatus, TicketPriority } from "@/types/ticket";
import { timeAgo } from "@/utils/timeAgo";

const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Abiertos",
  IN_PROGRESS: "En progreso",
  WAITING: "En espera",
  RESOLVED: "Resueltos",
  CLOSED: "Cerrados",
};

const STATUS_BADGE: Record<TicketStatus, string> = {
  OPEN:        "bg-blue-500/15 text-blue-400 border-blue-500/20",
  IN_PROGRESS: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  WAITING:     "bg-yellow-500/15 text-yellow-300 border-yellow-500/20",
  RESOLVED:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  CLOSED:      "bg-dark-raised text-content-muted border-dark-border",
};

const PRIORITY_COLOR: Record<TicketPriority, string> = {
  CRITICAL: "bg-red-500",
  HIGH:     "bg-orange-500",
  MEDIUM:   "bg-amber-400",
  LOW:      "bg-content-muted",
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  CRITICAL: "CRÍTICO",
  HIGH:     "ALTO",
  MEDIUM:   "MEDIO",
  LOW:      "BAJO",
};

const STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED"];

export default function TicketListScreen() {
  const {
    initialStatus,
    slaAtRisk,
    assigneeId,
  } = useLocalSearchParams<{ initialStatus?: string; slaAtRisk?: string; assigneeId?: string }>();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState<TicketStatus | undefined>(
    (initialStatus as TicketStatus) || "OPEN"
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Apply initialStatus when navigated from dashboard
  useEffect(() => {
    if (initialStatus) setActiveStatus(initialStatus as TicketStatus);
  }, [initialStatus]);

  // Debounce search → server-side query
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const { data: statsData } = useTicketStats();
  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, refetch } =
    useInfiniteTickets({
      status: activeStatus,
      q: debouncedSearch || undefined,
      slaAtRisk: slaAtRisk === "true" ? true : undefined,
      assigneeId: assigneeId || undefined,
    });

  const tickets = data?.pages.flatMap((p) => p.content) ?? [];

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <View className="flex-1 bg-dark-bg">
      <StatusBar barStyle="light-content" backgroundColor="#0C0C14" />

      {/* Header */}
      <View className="bg-dark-surface border-b border-dark-border px-4 pt-16 pb-3">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-content-primary text-xl font-bold">Tickets</Text>
          {(slaAtRisk === "true" || assigneeId) && (
            <View className="flex-row items-center gap-1.5 bg-brand/15 border border-brand/30 px-2.5 py-1 rounded-full">
              <Ionicons name="filter" size={11} color="#A78BFA" />
              <Text className="text-brand-light text-[10px] font-semibold">
                {slaAtRisk === "true" ? "SLA en riesgo" : "Asignados a mí"}
              </Text>
            </View>
          )}
        </View>
        <View className="flex-row items-center bg-dark-raised rounded-xl px-3 gap-2">
          <Ionicons name="search-outline" size={16} color="#4A4A5C" />
          <TextInput
            className="flex-1 py-2.5 text-content-primary text-sm"
            placeholder="Buscar por asunto o cliente..."
            placeholderTextColor="#4A4A5C"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color="#4A4A5C" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Status tabs with counts */}
      <View className="bg-dark-surface border-b border-dark-border">
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={STATUSES}
          keyExtractor={(s) => s}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}
          renderItem={({ item }) => {
            const isActive = activeStatus === item;
            const count = statsData?.byStatus[item];
            return (
              <TouchableOpacity
                onPress={() => setActiveStatus(item === activeStatus ? undefined : item)}
                className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${
                  isActive ? "bg-brand border-brand" : "bg-dark-raised border-dark-border"
                }`}
              >
                <Text className={`text-xs font-semibold ${isActive ? "text-white" : "text-content-secondary"}`}>
                  {STATUS_LABELS[item]}
                </Text>
                {count !== undefined && (
                  <View className={`rounded-full px-1.5 py-0.5 min-w-[18px] items-center ${isActive ? "bg-white/20" : "bg-dark-border"}`}>
                    <Text className={`text-[10px] font-bold ${isActive ? "text-white" : "text-content-secondary"}`}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* List */}
      <FlatList
        data={tickets}
        keyExtractor={(t) => t.id}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#7C3AED" />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        renderItem={({ item }) => <TicketCard ticket={item} />}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator color="#7C3AED" style={{ paddingVertical: 16 }} />
          ) : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <View className="items-center justify-center py-24">
              <Ionicons name="ticket-outline" size={48} color="#2A2A3C" />
              <Text className="text-content-muted text-sm mt-3">Sin tickets</Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingVertical: 8 }}
      />
    </View>
  );
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  const badgeClasses = STATUS_BADGE[ticket.status].split(" ");

  return (
    <TouchableOpacity
      onPress={() =>
        router.push({ pathname: "/(tabs)/tickets/[id]", params: { id: ticket.id } })
      }
      className="mx-3 my-1.5 bg-dark-surface border border-dark-border rounded-2xl p-4"
      activeOpacity={0.7}
    >
      {/* Row 1: priority dot + status + priority label + SLA breach + time */}
      <View className="flex-row items-center gap-2 mb-2.5">
        <View className={`w-2 h-2 rounded-full ${PRIORITY_COLOR[ticket.priority]}`} />

        <View className={`px-2 py-0.5 rounded-full border ${badgeClasses.slice(0, 3).join(" ")}`}>
          <Text className={`text-[10px] font-bold ${badgeClasses[1]}`}>
            {STATUS_LABELS[ticket.status]}
          </Text>
        </View>

        <View className="bg-dark-raised border border-dark-border px-2 py-0.5 rounded-full">
          <Text className="text-[10px] font-semibold text-content-muted">
            {PRIORITY_LABEL[ticket.priority]}
          </Text>
        </View>

        {ticket.slaBreached && (
          <View className="bg-red-500/15 border border-red-500/30 px-2 py-0.5 rounded-full flex-row items-center gap-0.5">
            <Ionicons name="warning-outline" size={9} color="#EF4444" />
            <Text className="text-[10px] font-bold text-red-400">SLA</Text>
          </View>
        )}

        <Text className="ml-auto text-content-muted text-xs">{timeAgo(ticket.createdAt)}</Text>
      </View>

      {/* Title */}
      <Text className="text-content-primary font-semibold text-sm leading-5 mb-2" numberOfLines={2}>
        {ticket.title}
      </Text>

      {/* Description preview */}
      {ticket.description ? (
        <Text className="text-content-muted text-xs leading-4 mb-2" numberOfLines={1}>
          {ticket.description}
        </Text>
      ) : null}

      {/* Row 3: labels + source + comments */}
      <View className="flex-row items-center gap-2">
        {ticket.labels.slice(0, 2).map((l) => (
          <View key={l} className="bg-brand/10 border border-brand/20 px-2 py-0.5 rounded-full">
            <Text className="text-[10px] text-brand-light">{l}</Text>
          </View>
        ))}

        <View className="ml-auto flex-row items-center gap-3">
          {ticket.commentsCount > 0 && (
            <View className="flex-row items-center gap-1">
              <Ionicons name="chatbubble-outline" size={11} color="#4A4A5C" />
              <Text className="text-content-muted text-xs">{ticket.commentsCount}</Text>
            </View>
          )}
          <View className="flex-row items-center gap-1">
            <Ionicons name="git-branch-outline" size={11} color="#4A4A5C" />
            <Text className="text-content-muted text-xs">{ticket.source}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
