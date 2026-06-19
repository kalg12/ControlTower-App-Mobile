import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Modal,
  ScrollView,
  Platform,
} from "react-native";
import { useState, useCallback, useEffect, useRef } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useInfiniteTickets, useTicketStats } from "@/queries/tickets.queries";
import { Ticket, TicketStatus, TicketPriority, TicketSource } from "@/types/ticket";
import { timeAgo } from "@/utils/timeAgo";

/* ─── Constants ─── */

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

const PRIORITY_BADGE_COLORS: Record<TicketPriority, string> = {
  CRITICAL: "bg-red-500/15 text-red-400 border-red-500/30",
  HIGH:     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  MEDIUM:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  LOW:      "bg-dark-raised text-content-muted border-dark-border",
};

const STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED"];
const PRIORITIES: TicketPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const SOURCES: TicketSource[] = ["EMAIL", "MANUAL", "POS", "WEBHOOK", "HEALTH_ALERT"];
const SOURCE_LABELS: Record<TicketSource, string> = {
  EMAIL:        "Email",
  MANUAL:       "Manual",
  POS:          "POS",
  WEBHOOK:      "Webhook",
  HEALTH_ALERT: "Alerta salud",
};

/* ─── Screen ─── */

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
  const [filterPriority, setFilterPriority] = useState<TicketPriority | undefined>();
  const [filterSource, setFilterSource] = useState<TicketSource | undefined>();
  const [showFilters, setShowFilters] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (initialStatus) setActiveStatus(initialStatus as TicketStatus);
  }, [initialStatus]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const hasActiveFilters = !!(filterPriority || filterSource || slaAtRisk === "true" || assigneeId);
  const activeFilterCount =
    (filterPriority ? 1 : 0) +
    (filterSource ? 1 : 0) +
    (slaAtRisk === "true" ? 1 : 0) +
    (assigneeId ? 1 : 0);

  const { data: statsData, refetch: refetchStats } = useTicketStats();
  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, refetch: refetchList } =
    useInfiniteTickets({
      status: activeStatus,
      q: debouncedSearch || undefined,
      priority: filterPriority,
      source: filterSource,
      slaAtRisk: slaAtRisk === "true" ? true : undefined,
      assigneeId: assigneeId || undefined,
    });

  function handleRefresh() {
    refetchStats();
    refetchList();
  }

  const tickets = data?.pages.flatMap((p) => p.content) ?? [];
  const totalElements = data?.pages[0]?.totalElements ?? 0;

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  function clearAllFilters() {
    setFilterPriority(undefined);
    setFilterSource(undefined);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  return (
    <View className="flex-1 bg-dark-bg">
      <StatusBar barStyle="light-content" backgroundColor="#0C0C14" />

      {/* ── Header ── */}
      <View className="bg-dark-surface border-b border-dark-border px-4 pt-16 pb-3">
        <View className="flex-row items-center justify-between mb-3">
          <View>
            <Text className="text-content-primary text-xl font-bold">Tickets</Text>
            {totalElements > 0 && !isLoading && (
              <Text className="text-content-muted text-xs mt-0.5">{totalElements} resultados</Text>
            )}
          </View>
          <TouchableOpacity
            onPress={() => { setShowFilters(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
              hasActiveFilters
                ? "bg-brand/15 border-brand/40"
                : "bg-dark-raised border-dark-border"
            }`}
          >
            <Ionicons
              name="options-outline"
              size={14}
              color={hasActiveFilters ? "#A78BFA" : "#8888A0"}
            />
            <Text className={`text-xs font-semibold ${hasActiveFilters ? "text-brand-light" : "text-content-secondary"}`}>
              Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View className="flex-row items-center bg-dark-raised rounded-xl px-3 gap-2">
          <Ionicons name="search-outline" size={16} color="#4A4A5C" />
          <TextInput
            className="flex-1 py-2.5 text-content-primary text-sm"
            placeholder="Buscar por asunto, descripción o email..."
            placeholderTextColor="#4A4A5C"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 && Platform.OS === "android" && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color="#4A4A5C" />
            </TouchableOpacity>
          )}
        </View>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-2.5"
            contentContainerStyle={{ gap: 6 }}
          >
            {filterPriority && (
              <TouchableOpacity
                onPress={() => setFilterPriority(undefined)}
                className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full border ${PRIORITY_BADGE_COLORS[filterPriority]}`}
              >
                <Text className={`text-[10px] font-semibold ${PRIORITY_BADGE_COLORS[filterPriority].split(" ")[1]}`}>
                  {PRIORITY_LABEL[filterPriority]}
                </Text>
                <Ionicons name="close" size={9} color="#8888A0" />
              </TouchableOpacity>
            )}
            {filterSource && (
              <TouchableOpacity
                onPress={() => setFilterSource(undefined)}
                className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-brand/15 border border-brand/30"
              >
                <Text className="text-[10px] font-semibold text-brand-light">
                  {SOURCE_LABELS[filterSource]}
                </Text>
                <Ionicons name="close" size={9} color="#A78BFA" />
              </TouchableOpacity>
            )}
            {slaAtRisk === "true" && (
              <View className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-orange-500/15 border border-orange-500/30">
                <Ionicons name="timer-outline" size={9} color="#F97316" />
                <Text className="text-[10px] font-semibold text-orange-400">SLA en riesgo</Text>
              </View>
            )}
            {assigneeId && (
              <View className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-brand/15 border border-brand/30">
                <Ionicons name="person-outline" size={9} color="#A78BFA" />
                <Text className="text-[10px] font-semibold text-brand-light">Asignados a mí</Text>
              </View>
            )}
            {(filterPriority || filterSource) && (
              <TouchableOpacity
                onPress={clearAllFilters}
                className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-dark-raised border border-dark-border"
              >
                <Text className="text-[10px] text-content-muted">Limpiar</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </View>

      {/* ── Status tabs ── */}
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
                onPress={() => {
                  setActiveStatus(item === activeStatus ? undefined : item);
                  Haptics.selectionAsync();
                }}
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

      {/* ── Ticket list ── */}
      <FlatList
        data={tickets}
        keyExtractor={(t) => t.id}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor="#7C3AED" />
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
              <Text className="text-content-muted text-sm mt-3">
                {search ? "Sin resultados para esa búsqueda" : "Sin tickets"}
              </Text>
              {(hasActiveFilters || search) && (
                <TouchableOpacity
                  onPress={() => { clearAllFilters(); setSearch(""); }}
                  className="mt-3 flex-row items-center gap-1"
                >
                  <Text className="text-brand-light text-sm">Limpiar filtros</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingVertical: 8 }}
      />

      {/* ── Filter modal ── */}
      <FilterModal
        visible={showFilters}
        priority={filterPriority}
        source={filterSource}
        onPriority={setFilterPriority}
        onSource={setFilterSource}
        onClose={() => setShowFilters(false)}
      />
    </View>
  );
}

/* ─── Ticket card ─── */

function TicketCard({ ticket }: { ticket: Ticket }) {
  const badgeClasses = STATUS_BADGE[ticket.status].split(" ");

  return (
    <TouchableOpacity
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({ pathname: "/(tabs)/tickets/[id]", params: { id: ticket.id } });
      }}
      className="mx-3 my-1.5 bg-dark-surface border border-dark-border rounded-2xl p-4 active:opacity-80"
      activeOpacity={0.75}
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
      <Text className="text-content-primary font-semibold text-sm leading-5 mb-1.5" numberOfLines={2}>
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

/* ─── Filter bottom sheet ─── */

function FilterModal({
  visible,
  priority,
  source,
  onPriority,
  onSource,
  onClose,
}: {
  visible: boolean;
  priority: TicketPriority | undefined;
  source: TicketSource | undefined;
  onPriority: (p: TicketPriority | undefined) => void;
  onSource: (s: TicketSource | undefined) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <TouchableOpacity
        className="flex-1 bg-black/50"
        activeOpacity={1}
        onPress={onClose}
      />
      <View className="bg-dark-surface border-t border-dark-border rounded-t-3xl px-5 pt-5 pb-10">
        {/* Handle */}
        <View className="w-10 h-1 bg-dark-border rounded-full self-center mb-5" />

        <View className="flex-row items-center justify-between mb-5">
          <Text className="text-content-primary font-bold text-base">Filtros</Text>
          <TouchableOpacity
            onPress={() => { onPriority(undefined); onSource(undefined); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Text className="text-brand-light text-sm">Limpiar todo</Text>
          </TouchableOpacity>
        </View>

        {/* Priority */}
        <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">
          Prioridad
        </Text>
        <View className="flex-row flex-wrap gap-2 mb-5">
          {PRIORITIES.map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => { onPriority(priority === p ? undefined : p); Haptics.selectionAsync(); }}
              className={`px-3 py-1.5 rounded-xl border ${
                priority === p
                  ? PRIORITY_BADGE_COLORS[p]
                  : "bg-dark-raised border-dark-border"
              }`}
            >
              <Text className={`text-xs font-semibold ${
                priority === p
                  ? PRIORITY_BADGE_COLORS[p].split(" ")[1]
                  : "text-content-secondary"
              }`}>
                {PRIORITY_LABEL[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Source */}
        <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">
          Origen
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {SOURCES.map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => { onSource(source === s ? undefined : s); Haptics.selectionAsync(); }}
              className={`px-3 py-1.5 rounded-xl border ${
                source === s
                  ? "bg-brand border-brand"
                  : "bg-dark-raised border-dark-border"
              }`}
            >
              <Text className={`text-xs font-semibold ${
                source === s ? "text-white" : "text-content-secondary"
              }`}>
                {SOURCE_LABELS[s]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={onClose}
          className="mt-6 bg-brand rounded-2xl py-4 items-center"
        >
          <Text className="text-white font-bold text-sm">Aplicar filtros</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

