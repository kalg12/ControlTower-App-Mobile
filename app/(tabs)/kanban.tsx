import {
  View,
  Text,
  FlatList,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Platform,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { apiClient } from "@/api/client";
import { useAuthStore } from "@/stores/auth.store";

/* ─── Types ─── */

interface CardResponse {
  id: string;
  columnId: string;
  title: string;
  description?: string;
  assigneeIds: string[];
  dueDate?: string;
  priority?: string;
  labels: string[];
  checklist: { id: string; text: string; done: boolean }[];
  estimatedMinutes?: number;
  attendedBy?: string;
  attendedAt?: string;
  wasOverdue?: boolean;
  clientId?: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkItemResponse {
  id: string;
  card: CardResponse;
  boardId: string;
  boardName: string;
  columnId: string;
  columnName: string;
  columnKind: string;
  tenantId: string;
  tenantName: string;
  assigneeNames: string[];
  checklistProgress?: string;
  overdue: boolean;
}

interface BoardResponse {
  id: string;
  name: string;
  description?: string;
  visibility: string;
  clientId?: string;
}

/* ─── Helpers ─── */

const PRIORITY_STYLE: Record<string, { text: string; dot: string }> = {
  CRITICAL: { text: "text-red-400",    dot: "bg-red-500" },
  HIGH:     { text: "text-orange-400", dot: "bg-orange-500" },
  MEDIUM:   { text: "text-amber-400",  dot: "bg-amber-400" },
  LOW:      { text: "text-content-muted", dot: "bg-content-muted" },
};

const COLUMN_KIND_ORDER: Record<string, number> = {
  BACKLOG: 0, TODO: 1, IN_PROGRESS: 2, IN_REVIEW: 3, REVIEW: 3,
  DONE: 4, COMPLETED: 4, ARCHIVED: 5,
};

function kindOrder(kind: string): number {
  return COLUMN_KIND_ORDER[kind?.toUpperCase()] ?? 99;
}

function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    BACKLOG: "Backlog",
    TODO: "Por hacer",
    IN_PROGRESS: "En progreso",
    IN_REVIEW: "En revisión",
    REVIEW: "En revisión",
    DONE: "Hecho",
    COMPLETED: "Completado",
    ARCHIVED: "Archivado",
  };
  return map[kind?.toUpperCase()] ?? kind;
}

function isDueSoon(dueDate?: string): boolean {
  if (!dueDate) return false;
  const diff = new Date(dueDate).getTime() - Date.now();
  return diff > 0 && diff < 48 * 3_600_000;
}

function isDueOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  return new Date(dueDate).getTime() < Date.now();
}

function formatDueDate(dueDate: string): string {
  const d = new Date(dueDate);
  const today = new Date();
  const diff = Math.ceil((d.getTime() - today.setHours(0, 0, 0, 0)) / 86_400_000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === -1) return "Ayer";
  if (diff < 0) return `Hace ${Math.abs(diff)}d`;
  if (diff < 7) return `En ${diff}d`;
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

/* ─── Screen ─── */

export default function KanbanScreen() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data: boards } = useQuery({
    queryKey: ["boards"],
    queryFn: async (): Promise<BoardResponse[]> => {
      const res = await apiClient.get("/api/v1/boards", { params: { size: 50 } });
      return res.data?.content ?? res.data ?? [];
    },
    staleTime: 60_000,
    retry: false,
  });

  const {
    data: items,
    isLoading,
    isRefetching,
    refetch,
    isError,
  } = useQuery({
    queryKey: ["kanban", "supervisor-items"],
    queryFn: async (): Promise<WorkItemResponse[]> => {
      const res = await apiClient.get("/api/v1/kanban/supervisor-items");
      return res.data ?? [];
    },
    staleTime: 30_000,
    retry: false,
  });

  const moveCard = useMutation({
    mutationFn: async ({ cardId, columnKind }: { cardId: string; columnKind: string }) =>
      apiClient.patch(`/api/v1/kanban/cards/${cardId}/move-to`, { columnKind }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kanban"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => Alert.alert("Error", "No se pudo mover la tarjeta"),
  });

  // Group by columnKind, sorted by natural order
  const sections = Object.entries(
    (items ?? []).reduce<Record<string, WorkItemResponse[]>>((acc, item) => {
      const k = item.columnKind ?? "OTHER";
      if (!acc[k]) acc[k] = [];
      acc[k].push(item);
      return acc;
    }, {})
  )
    .sort(([a], [b]) => kindOrder(a) - kindOrder(b))
    .map(([kind, data]) => ({ title: kind, data }));

  const overdueCount = (items ?? []).filter((i) => i.overdue).length;

  return (
    <View className="flex-1 bg-dark-bg">
      <StatusBar barStyle="light-content" backgroundColor="#0C0C14" />

      {/* ── Header ── */}
      <View className="bg-dark-surface border-b border-dark-border px-4 pt-16 pb-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-content-primary text-xl font-bold">Kanban</Text>
            {(items ?? []).length > 0 && (
              <Text className="text-content-muted text-xs mt-0.5">
                {(items ?? []).length} tarjetas · {sections.length} columnas
              </Text>
            )}
          </View>
          {overdueCount > 0 && (
            <View className="bg-red-500/15 border border-red-500/30 px-2.5 py-1 rounded-full flex-row items-center gap-1">
              <Ionicons name="alert-circle" size={12} color="#EF4444" />
              <Text className="text-red-400 text-xs font-bold">{overdueCount} vencidas</Text>
            </View>
          )}
        </View>

        {/* Board pills */}
        {(boards ?? []).length > 0 && (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={boards ?? []}
            keyExtractor={(b) => b.id}
            contentContainerStyle={{ paddingTop: 10, gap: 8 }}
            renderItem={({ item: board }) => (
              <View className="bg-dark-raised border border-dark-border px-3 py-1.5 rounded-xl flex-row items-center gap-1.5">
                <Ionicons name="albums-outline" size={11} color="#8888A0" />
                <Text className="text-content-secondary text-xs font-medium">{board.name}</Text>
              </View>
            )}
          />
        )}
      </View>

      {/* ── Body ── */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#7C3AED" size="large" />
        </View>
      ) : isError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="cloud-offline-outline" size={48} color="#2A2A3C" />
          <Text className="text-content-muted text-sm mt-3 text-center">
            No se pudieron cargar los elementos
          </Text>
          <TouchableOpacity onPress={() => refetch()} className="mt-4">
            <Text className="text-brand-light text-sm">Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : sections.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Ionicons name="albums-outline" size={48} color="#2A2A3C" />
          <Text className="text-content-muted text-sm mt-3">Sin tarjetas Kanban</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#7C3AED" />
          }
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <KanbanColumnHeader kind={section.title} count={section.data.length} />
          )}
          renderItem={({ item }) => (
            <KanbanCard
              item={item}
              onMove={(cardId) => handleMoveCard(cardId)}
            />
          )}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  );

  function handleMoveCard(cardId: string) {
    const columnKinds = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"];
    const labels = columnKinds.map(kindLabel);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...labels, "Cancelar"], cancelButtonIndex: labels.length, title: "Mover tarjeta a..." },
        (idx) => {
          if (idx < columnKinds.length) moveCard.mutate({ cardId, columnKind: columnKinds[idx] });
        }
      );
    } else {
      Alert.alert("Mover tarjeta a...", undefined, [
        ...columnKinds.map((k) => ({
          text: kindLabel(k),
          onPress: () => moveCard.mutate({ cardId, columnKind: k }),
        })),
        { text: "Cancelar", style: "cancel" as const },
      ]);
    }
  }
}

/* ─── Section header ─── */

function KanbanColumnHeader({ kind, count }: { kind: string; count: number }) {
  const isActive = ["IN_PROGRESS", "IN_REVIEW", "REVIEW"].includes(kind?.toUpperCase());
  const isDone = ["DONE", "COMPLETED", "ARCHIVED"].includes(kind?.toUpperCase());

  return (
    <View className="flex-row items-center gap-2 px-4 pt-5 pb-2">
      <View
        className={`w-2 h-2 rounded-full ${
          isDone ? "bg-emerald-400" : isActive ? "bg-brand" : "bg-content-muted"
        }`}
      />
      <Text className="text-content-primary font-bold text-sm">{kindLabel(kind)}</Text>
      <View className="bg-dark-raised border border-dark-border px-2 py-0.5 rounded-full">
        <Text className="text-content-muted text-[10px] font-bold">{count}</Text>
      </View>
    </View>
  );
}

/* ─── Kanban card ─── */

function KanbanCard({
  item,
  onMove,
}: {
  item: WorkItemResponse;
  onMove: (cardId: string) => void;
}) {
  const card = item.card;
  const priority = card.priority ?? "LOW";
  const pStyle = PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.LOW;
  const overdue = item.overdue || isDueOverdue(card.dueDate);
  const dueSoon = !overdue && isDueSoon(card.dueDate);
  const checklistDone = card.checklist.filter((c) => c.done).length;
  const checklistTotal = card.checklist.length;

  return (
    <View className="mx-3 my-1 bg-dark-surface border border-dark-border rounded-2xl p-4">
      {/* Row 1: priority dot + board name + overdue */}
      <View className="flex-row items-center gap-2 mb-2">
        <View className={`w-1.5 h-1.5 rounded-full ${pStyle.dot}`} />
        <Text className="text-content-muted text-[10px] flex-1 font-medium" numberOfLines={1}>
          {item.boardName} › {item.columnName}
        </Text>
        {overdue && (
          <View className="bg-red-500/15 border border-red-500/30 px-2 py-0.5 rounded-full flex-row items-center gap-0.5">
            <Ionicons name="warning-outline" size={9} color="#EF4444" />
            <Text className="text-[10px] font-bold text-red-400">Vencida</Text>
          </View>
        )}
        {dueSoon && (
          <View className="bg-orange-500/15 border border-orange-500/30 px-2 py-0.5 rounded-full">
            <Text className="text-[10px] font-bold text-orange-400">Pronto</Text>
          </View>
        )}
      </View>

      {/* Title */}
      <Text className="text-content-primary font-semibold text-sm leading-5 mb-2" numberOfLines={2}>
        {card.title}
      </Text>

      {/* Description */}
      {card.description ? (
        <Text className="text-content-muted text-xs leading-4 mb-2" numberOfLines={1}>
          {card.description}
        </Text>
      ) : null}

      {/* Labels */}
      {card.labels.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5 mb-2">
          {card.labels.slice(0, 3).map((l) => (
            <View key={l} className="bg-brand/10 border border-brand/20 px-2 py-0.5 rounded-full">
              <Text className="text-[10px] text-brand-light">{l}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Footer row */}
      <View className="flex-row items-center gap-3 mt-1">
        {/* Assignees */}
        {item.assigneeNames.length > 0 && (
          <View className="flex-row items-center gap-1 flex-1">
            <Ionicons name="person-outline" size={11} color="#4A4A5C" />
            <Text className="text-content-muted text-xs" numberOfLines={1}>
              {item.assigneeNames.slice(0, 2).join(", ")}
              {item.assigneeNames.length > 2 ? ` +${item.assigneeNames.length - 2}` : ""}
            </Text>
          </View>
        )}

        {/* Checklist progress */}
        {checklistTotal > 0 && (
          <View className="flex-row items-center gap-1">
            <Ionicons
              name={checklistDone === checklistTotal ? "checkbox" : "checkbox-outline"}
              size={11}
              color={checklistDone === checklistTotal ? "#34D399" : "#4A4A5C"}
            />
            <Text className="text-content-muted text-xs">
              {checklistDone}/{checklistTotal}
            </Text>
          </View>
        )}

        {/* Due date */}
        {card.dueDate && (
          <View className="flex-row items-center gap-1">
            <Ionicons
              name="calendar-outline"
              size={11}
              color={overdue ? "#EF4444" : dueSoon ? "#F97316" : "#4A4A5C"}
            />
            <Text
              className={`text-xs ${
                overdue ? "text-red-400 font-semibold" : dueSoon ? "text-orange-400" : "text-content-muted"
              }`}
            >
              {formatDueDate(card.dueDate)}
            </Text>
          </View>
        )}

        {/* Move action */}
        <TouchableOpacity
          onPress={() => onMove(card.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="ml-auto"
        >
          <Ionicons name="arrow-forward-circle-outline" size={18} color="#4A4A5C" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
