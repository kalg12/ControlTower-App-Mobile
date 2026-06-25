import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  StatusBar,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ActionSheetIOS,
  PanResponder,
  Animated,
} from "react-native";
import { useState, useMemo, useRef, useEffect } from "react";
import * as Clipboard from "expo-clipboard";
import { useMutation } from "@tanstack/react-query";
import { aiAssist } from "@/api/ai.api";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppTheme } from "@/hooks/useAppTheme";
import {
  useBoard,
  useTenantUsers,
  useClients,
  useAddColumn,
  useDeleteColumn,
  useCreateCard,
  useUpdateCard,
  useMoveCard,
  useDeleteCard,
  useToggleChecklistItem,
  useAddChecklistItem,
  TenantUser,
  ClientOption,
} from "@/queries/kanban.queries";
import {
  Board,
  KanbanCard,
  KanbanColumn,
  CardPriority,
  CreateCardPayload,
  UpdateCardPayload,
  ChecklistItem,
} from "@/types/kanban";

/* ─── Constants ─── */

const SWIPE_THRESHOLD = 90;

const PRIORITY_STYLE: Record<CardPriority, { dot: string; text: string; badge: string }> = {
  LOW:      { dot: "bg-content-muted",  text: "text-content-muted",  badge: "bg-dark-raised border-dark-border" },
  MEDIUM:   { dot: "bg-amber-400",      text: "text-amber-400",      badge: "bg-amber-500/15 border-amber-500/30" },
  HIGH:     { dot: "bg-orange-500",     text: "text-orange-400",     badge: "bg-orange-500/15 border-orange-500/30" },
  CRITICAL: { dot: "bg-red-500",        text: "text-red-400",        badge: "bg-red-500/15 border-red-500/30" },
};

const PRIORITY_LABEL: Record<CardPriority, string> = {
  LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", CRITICAL: "Crítica",
};

const MONTHS_ES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];
const DAYS_ES = ["Lu","Ma","Mi","Ju","Vi","Sá","Do"];

/* ─── Helpers ─── */

function formatDue(dueDate?: string): { label: string; overdue: boolean; soon: boolean } {
  if (!dueDate) return { label: "", overdue: false, soon: false };
  const diff = new Date(dueDate).getTime() - Date.now();
  const days = Math.ceil(diff / 86_400_000);
  const overdue = diff < 0;
  const soon = diff > 0 && diff < 48 * 3_600_000;
  if (overdue) return { label: days === -1 ? "Ayer" : `Hace ${Math.abs(days)}d`, overdue: true, soon: false };
  if (days === 0) return { label: "Hoy", overdue: false, soon: true };
  if (days === 1) return { label: "Mañana", overdue: false, soon: true };
  if (days < 7) return { label: `En ${days}d`, overdue: false, soon };
  return {
    label: new Date(dueDate).toLocaleDateString("es-MX", { day: "numeric", month: "short" }),
    overdue: false, soon: false,
  };
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function buildCalendarCells(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const offset = (firstDay + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

function userInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

/* ─── Avatar bubble ─── */

function UserBubble({ user, size = 7 }: { user: TenantUser; size?: number }) {
  const sizeClass = size === 7 ? "w-7 h-7" : "w-6 h-6";
  const textSize = size === 7 ? "text-[10px]" : "text-[9px]";
  return (
    <View className={`${sizeClass} rounded-full bg-brand/25 border border-brand/40 items-center justify-center`}>
      <Text className={`${textSize} text-brand-light font-bold`}>{userInitials(user.fullName)}</Text>
    </View>
  );
}

/* ─── DismissHandle: drag handle with swipe-to-dismiss ─── */

function DismissHandle({ onDismiss }: { onDismiss: () => void }) {
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 8 && gs.dy > Math.abs(gs.dx),
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 60 || gs.vy > 0.6) onDismiss();
      },
    }),
  ).current;
  return (
    <View {...pan.panHandlers} className="items-center pt-3 pb-1">
      <View className="w-10 h-1 bg-dark-border rounded-full" />
    </View>
  );
}

/* ─── DatePickerSheet ─── */

function DatePickerSheet({
  visible, value, onConfirm, onClose,
}: {
  visible: boolean; value: string;
  onConfirm: (iso: string) => void; onClose: () => void;
}) {
  const { iconSecondary } = useAppTheme();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const initial = value ? new Date(value + "T00:00:00") : null;
  const [selected, setSelected] = useState<Date | null>(initial);
  const [viewYear, setViewYear] = useState(initial?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial?.getMonth() ?? today.getMonth());

  function selectDay(day: number) {
    Haptics.selectionAsync();
    setSelected(new Date(viewYear, viewMonth, day));
  }
  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1);
  }
  function quickPick(days: number) {
    Haptics.selectionAsync();
    const d = addDays(today, days);
    setSelected(d); setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
  }

  const cells = buildCalendarCells(viewYear, viewMonth);
  const todayStr = toIsoDate(today);
  const selectedStr = selected ? toIsoDate(selected) : "";
  const quickOpts = [
    { label: "Hoy", days: 0 }, { label: "Mañana", days: 1 },
    { label: "3 días", days: 3 }, { label: "1 semana", days: 7 }, { label: "2 semanas", days: 14 },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/60 justify-end" onPress={onClose}>
        <View className="bg-dark-surface border-t border-dark-border rounded-t-3xl pb-8" onStartShouldSetResponder={() => true}>
          <DismissHandle onDismiss={onClose} />
          <View className="flex-row items-center justify-between px-5 mb-4">
            <TouchableOpacity onPress={onClose}><Text className="text-content-muted text-sm">Cancelar</Text></TouchableOpacity>
            <Text className="text-content-primary font-bold text-base">Fecha límite</Text>
            <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onConfirm(selected ? toIsoDate(selected) : ""); onClose(); }}>
              <Text className="text-brand-light font-bold text-sm">{selected ? "Confirmar" : "Sin fecha"}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }} className="mb-4">
            {quickOpts.map(q => {
              const iso = toIsoDate(addDays(today, q.days));
              const active = selectedStr === iso;
              return (
                <TouchableOpacity key={q.label} onPress={() => quickPick(q.days)}
                  className={`px-3 py-1.5 rounded-xl border ${active ? "bg-brand border-brand" : "bg-dark-raised border-dark-border"}`}>
                  <Text className={`text-xs font-semibold ${active ? "text-white" : "text-content-secondary"}`}>{q.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View className="flex-row items-center justify-between px-5 mb-3">
            <TouchableOpacity onPress={prevMonth} className="w-8 h-8 rounded-full bg-dark-raised border border-dark-border items-center justify-center" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={16} color={iconSecondary} />
            </TouchableOpacity>
            <Text className="text-content-primary font-bold text-sm">{MONTHS_ES[viewMonth]} {viewYear}</Text>
            <TouchableOpacity onPress={nextMonth} className="w-8 h-8 rounded-full bg-dark-raised border border-dark-border items-center justify-center" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-forward" size={16} color={iconSecondary} />
            </TouchableOpacity>
          </View>

          <View className="flex-row px-4 mb-1">
            {DAYS_ES.map(d => (
              <View key={d} className="flex-1 items-center py-1">
                <Text className="text-content-muted text-[11px] font-semibold">{d}</Text>
              </View>
            ))}
          </View>

          <View className="px-4">
            {Array.from({ length: Math.ceil(cells.length / 7) }).map((_, row) => (
              <View key={row} className="flex-row">
                {[...cells.slice(row * 7, row * 7 + 7), ...Array(Math.max(0, 7 - cells.slice(row * 7, row * 7 + 7).length)).fill(null)].map((day, col) => {
                  if (!day) return <View key={col} className="flex-1 py-1" />;
                  const iso = toIsoDate(new Date(viewYear, viewMonth, day));
                  const isToday = iso === todayStr;
                  const isSelected = iso === selectedStr;
                  const isPast = iso < todayStr;
                  return (
                    <TouchableOpacity key={col} onPress={() => selectDay(day)} className="flex-1 items-center py-1" hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                      <View className={`w-8 h-8 rounded-full items-center justify-center ${isSelected ? "bg-brand" : isToday ? "border border-brand bg-brand/10" : ""}`}>
                        <Text className={`text-sm font-medium ${isSelected ? "text-white font-bold" : isToday ? "text-brand-light font-bold" : isPast ? "text-content-muted" : "text-content-primary"}`}>
                          {day}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          <View className="flex-row items-center justify-between px-5 mt-4">
            {selected ? (
              <Text className="text-content-secondary text-sm">
                {selected.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
              </Text>
            ) : (
              <Text className="text-content-muted text-sm italic">Sin fecha seleccionada</Text>
            )}
            {selected && (
              <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setSelected(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text className="text-red-400 text-xs font-medium">Borrar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

/* ─── AssigneeSelector ─── */

function AssigneeSelector({
  assigneeIds, users, onChange,
}: {
  assigneeIds: string[];
  users: TenantUser[];
  onChange: (ids: string[]) => void;
}) {
  const { iconMuted, placeholder } = useAppTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const assigned = users.filter((u) => assigneeIds.includes(u.id));
  const filtered = users.filter(
    (u) =>
      !search ||
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  function toggle(userId: string) {
    Haptics.selectionAsync();
    onChange(
      assigneeIds.includes(userId)
        ? assigneeIds.filter((id) => id !== userId)
        : [...assigneeIds, userId],
    );
  }

  return (
    <>
      <TouchableOpacity
        onPress={() => setPickerOpen(true)}
        className="bg-dark-raised border border-dark-border rounded-xl px-4 py-3 flex-row items-center gap-3"
      >
        {assigned.length === 0 ? (
          <>
            <Ionicons name="person-add-outline" size={16} color={iconMuted} />
            <Text className="flex-1 text-sm text-content-muted">Sin asignar (opcional)</Text>
            <Ionicons name="chevron-forward" size={14} color={iconMuted} />
          </>
        ) : (
          <>
            <View className="flex-row gap-0.5 flex-1 items-center">
              {assigned.slice(0, 5).map((u) => (
                <UserBubble key={u.id} user={u} size={6} />
              ))}
              {assigned.length > 5 && (
                <View className="w-6 h-6 rounded-full bg-dark-raised border border-dark-border items-center justify-center ml-0.5">
                  <Text className="text-content-muted text-[9px]">+{assigned.length - 5}</Text>
                </View>
              )}
              <Text className="text-content-secondary text-xs ml-2">
                {assigned.length === 1
                  ? assigned[0].fullName.split(" ")[0]
                  : `${assigned.length} personas`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={iconMuted} />
          </>
        )}
      </TouchableOpacity>

      {/* User picker sheet */}
      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => { setPickerOpen(false); setSearch(""); }}>
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={() => { setPickerOpen(false); setSearch(""); }}>
          <View className="bg-dark-surface border-t border-dark-border rounded-t-3xl" style={{ maxHeight: "75%" }} onStartShouldSetResponder={() => true}>
            <DismissHandle onDismiss={() => { setPickerOpen(false); setSearch(""); }} />
            <View className="flex-row items-center justify-between px-5 py-3 border-b border-dark-border">
              <TouchableOpacity
                onPress={() => { setPickerOpen(false); setSearch(""); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={iconMuted} />
              </TouchableOpacity>
              <Text className="text-content-primary font-bold">Asignar a</Text>
              <View className="w-8 items-end">
                {assigneeIds.length > 0 && (
                  <View className="bg-brand rounded-full w-5 h-5 items-center justify-center">
                    <Text className="text-white text-[10px] font-bold">{assigneeIds.length}</Text>
                  </View>
                )}
              </View>
            </View>

            <View className="flex-row items-center bg-dark-raised border-b border-dark-border px-4 gap-2">
              <Ionicons name="search-outline" size={16} color={iconMuted} />
              <TextInput
                className="flex-1 py-3 text-content-primary text-sm"
                placeholder="Buscar colaborador..."
                placeholderTextColor={placeholder}
                value={search}
                onChangeText={setSearch}
              />
            </View>

            <FlatList
              data={filtered}
              keyExtractor={(u) => u.id}
              contentContainerStyle={{ paddingVertical: 4 }}
              renderItem={({ item: u }) => {
                const selected = assigneeIds.includes(u.id);
                return (
                  <TouchableOpacity
                    onPress={() => toggle(u.id)}
                    className={`flex-row items-center gap-3 px-5 py-3 ${selected ? "bg-brand/5" : ""}`}
                  >
                    <UserBubble user={u} size={7} />
                    <View className="flex-1">
                      <Text className="text-content-primary text-sm font-medium">{u.fullName}</Text>
                      <Text className="text-content-muted text-xs">{u.email}</Text>
                    </View>
                    <View className={`w-5 h-5 rounded-full border-2 items-center justify-center ${selected ? "bg-brand border-brand" : "border-dark-border"}`}>
                      {selected && <Ionicons name="checkmark" size={11} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View className="items-center py-10">
                  <Text className="text-content-muted text-sm">Sin resultados</Text>
                </View>
              }
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/* ─── ClientSelector ─── */

function ClientSelector({
  clientId, clients: allClients, onChange,
}: {
  clientId?: string;
  clients: ClientOption[];
  onChange: (id: string | undefined) => void;
}) {
  const { iconMuted, placeholder } = useAppTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedClient = allClients.find((c) => c.id === clientId);
  const clients = search
    ? allClients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : allClients;

  return (
    <>
      <TouchableOpacity
        onPress={() => setPickerOpen(true)}
        className="bg-dark-raised border border-dark-border rounded-xl px-4 py-3 flex-row items-center gap-3"
      >
        <Ionicons name="business-outline" size={16} color={clientId ? "#7C3AED" : iconMuted} />
        {selectedClient ? (
          <>
            <Text className="flex-1 text-sm text-content-primary font-medium">{selectedClient.name}</Text>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); onChange(undefined); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={16} color={iconMuted} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text className="flex-1 text-sm text-content-muted">Sin cliente (opcional)</Text>
            <Ionicons name="chevron-forward" size={14} color={iconMuted} />
          </>
        )}
      </TouchableOpacity>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => { setPickerOpen(false); setSearch(""); }}>
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={() => { setPickerOpen(false); setSearch(""); }}>
          <View className="bg-dark-surface border-t border-dark-border rounded-t-3xl" style={{ maxHeight: "70%" }} onStartShouldSetResponder={() => true}>
            <DismissHandle onDismiss={() => { setPickerOpen(false); setSearch(""); }} />
            <View className="flex-row items-center justify-between px-5 py-3 border-b border-dark-border">
              <TouchableOpacity onPress={() => { setPickerOpen(false); setSearch(""); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={iconMuted} />
              </TouchableOpacity>
              <Text className="text-content-primary font-bold">Vincular cliente</Text>
              <View className="w-8" />
            </View>

            <View className="flex-row items-center bg-dark-raised border-b border-dark-border px-4 gap-2">
              <Ionicons name="search-outline" size={16} color={iconMuted} />
              <TextInput
                className="flex-1 py-3 text-content-primary text-sm"
                placeholder="Buscar cliente..."
                placeholderTextColor={placeholder}
                value={search}
                onChangeText={setSearch}
              />
            </View>

            <FlatList
              data={clients ?? []}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{ paddingVertical: 4 }}
              renderItem={({ item: c }) => {
                const isSelected = c.id === clientId;
                return (
                  <TouchableOpacity
                    onPress={() => { onChange(c.id); setPickerOpen(false); setSearch(""); }}
                    className={`flex-row items-center gap-3 px-5 py-3.5 ${isSelected ? "bg-brand/5" : ""}`}
                  >
                    <View className="w-8 h-8 rounded-lg bg-brand/15 items-center justify-center">
                      <Ionicons name="business-outline" size={14} color="#7C3AED" />
                    </View>
                    <Text className="flex-1 text-content-primary text-sm font-medium">{c.name}</Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={18} color="#7C3AED" />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View className="items-center py-10">
                  <Text className="text-content-muted text-sm">{search ? "Sin resultados" : "Sin clientes disponibles"}</Text>
                </View>
              }
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/* ─── Screen ─── */

export default function BoardDetailScreen() {
  const { boardId, initialCardId } = useLocalSearchParams<{ boardId: string; initialCardId?: string }>();
  const { barStyle, statusBarBg, iconSecondary, iconMuted } = useAppTheme();

  const [showAddColumn, setShowAddColumn] = useState(false);
  const [createCardColumnId, setCreateCardColumnId] = useState<string | null>(null);
  const [editCard, setEditCard] = useState<KanbanCard | null>(null);
  const [viewCard, setViewCard] = useState<KanbanCard | null>(null);

  const { data: board, isLoading, isRefetching, refetch } = useBoard(boardId);

  // Deep-link from notification: auto-open the target card once the board loads.
  // Track the last processed cardId so different card IDs each trigger the modal,
  // but the same ID is not processed twice (prevents double-open on re-renders).
  // Guard against Android serializing absent optional params as the string "undefined".
  const lastDeepLinkedId = useRef<string | null>(null);
  useEffect(() => {
    if (!initialCardId || initialCardId === "undefined" || !board) return;
    if (lastDeepLinkedId.current === initialCardId) return;
    lastDeepLinkedId.current = initialCardId;
    for (const col of board.columns) {
      const card = col.cards.find((c) => c.id === initialCardId);
      if (card) { setViewCard(card); break; }
    }
  }, [board, initialCardId]);
  const { data: users = [] } = useTenantUsers();
  const { data: clients = [] } = useClients();

  const addColMutation    = useAddColumn(boardId);
  const delColMutation    = useDeleteColumn(boardId);
  const createCardMutation = useCreateCard(boardId);
  const updateCardMutation = useUpdateCard(boardId);
  const moveCardMutation   = useMoveCard(boardId);
  const delCardMutation    = useDeleteCard(boardId);
  const toggleItemMutation = useToggleChecklistItem(boardId);
  const addItemMutation    = useAddChecklistItem(boardId);

  const liveViewCard = useMemo(() => {
    if (!viewCard || !board) return null;
    for (const col of board.columns) {
      const found = col.cards.find((c) => c.id === viewCard.id);
      if (found) return found;
    }
    return null;
  }, [viewCard, board]);

  function handleMoveCard(card: KanbanCard) {
    const columns = board?.columns ?? [];
    const targets = columns.filter((c) => c.id !== card.columnId);
    if (targets.length === 0) { Alert.alert("Sin columnas", "Crea otra columna primero."); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...targets.map((c) => c.name), "Cancelar"], cancelButtonIndex: targets.length, title: "Mover a..." },
        (idx) => {
          if (idx < targets.length)
            moveCardMutation.mutate({ cardId: card.id, targetColumnId: targets[idx].id });
        },
      );
    } else {
      Alert.alert("Mover a...", undefined, [
        ...targets.map((c) => ({
          text: c.name,
          onPress: () => moveCardMutation.mutate({ cardId: card.id, targetColumnId: c.id }),
        })),
        { text: "Cancelar", style: "cancel" as const },
      ]);
    }
  }

  function handleMoveCardToColumn(card: KanbanCard, targetColumnId: string) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    moveCardMutation.mutate({ cardId: card.id, targetColumnId });
  }

  function confirmDeleteCard(card: KanbanCard) {
    Alert.alert(`Eliminar "${card.title}"`, "Esta acción no se puede deshacer.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar", style: "destructive",
        onPress: () => delCardMutation.mutate(card.id, { onSuccess: () => setViewCard(null) }),
      },
    ]);
  }

  function confirmDeleteColumn(col: KanbanColumn) {
    if (col.cards.length > 0) {
      Alert.alert("Columna con tarjetas", `"${col.name}" tiene ${col.cards.length} tarjeta(s). Muévelas primero.`);
      return;
    }
    Alert.alert(`Eliminar "${col.name}"`, "Esta acción no se puede deshacer.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => delColMutation.mutate(col.id) },
    ]);
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-dark-bg items-center justify-center">
        <ActivityIndicator color="#7C3AED" size="large" />
      </View>
    );
  }

  if (!board) {
    return (
      <View className="flex-1 bg-dark-bg items-center justify-center">
        <Text className="text-content-muted">Tablero no encontrado</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-brand-light">Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const sortedColumns = [...board.columns].sort((a, b) => a.position - b.position);
  const totalCards = board.columns.reduce((s, c) => s + c.cards.length, 0);
  const currentColIdx = sortedColumns.findIndex((c) => c.id === liveViewCard?.columnId);
  const nextCol = currentColIdx >= 0 && currentColIdx < sortedColumns.length - 1 ? sortedColumns[currentColIdx + 1] : undefined;
  const prevCol = currentColIdx >= 0 && currentColIdx > 0 ? sortedColumns[currentColIdx - 1] : undefined;

  return (
    <View className="flex-1 bg-dark-bg">
      <StatusBar barStyle={barStyle} backgroundColor={statusBarBg} />

      {/* Header */}
      <View className="bg-dark-surface border-b border-dark-border px-4 pt-14 pb-3">
        <View className="flex-row items-center gap-3">
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={22} color={iconSecondary} />
          </TouchableOpacity>
          <View className="flex-1 min-w-0">
            <Text className="text-content-primary font-bold text-base" numberOfLines={1}>{board.name}</Text>
            <Text className="text-content-muted text-xs">
              {board.columns.length} columnas · {totalCards} tarjetas
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => { setShowAddColumn(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            className="flex-row items-center gap-1 bg-dark-raised border border-dark-border px-2.5 py-1.5 rounded-xl"
          >
            <Ionicons name="add" size={14} color={iconSecondary} />
            <Text className="text-content-muted text-xs">Columna</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Columns */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#7C3AED" />}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {sortedColumns.length === 0 ? (
          <View className="items-center justify-center py-24 px-8">
            <Ionicons name="layers-outline" size={48} color={iconMuted} />
            <Text className="text-content-primary font-bold text-base mt-4 text-center">Sin columnas</Text>
            <Text className="text-content-muted text-sm text-center mt-2 leading-5">
              Añade columnas para organizar tus tarjetas.
            </Text>
            <TouchableOpacity onPress={() => setShowAddColumn(true)} className="mt-5 bg-brand px-5 py-2.5 rounded-xl flex-row items-center gap-2">
              <Ionicons name="add" size={16} color="#fff" />
              <Text className="text-white font-semibold text-sm">Añadir columna</Text>
            </TouchableOpacity>
          </View>
        ) : (
          sortedColumns.map((col, idx) => (
            <KanbanColumnSection
              key={col.id}
              column={col}
              nextColumn={sortedColumns[idx + 1]}
              prevColumn={sortedColumns[idx - 1]}
              users={users}
              clients={clients}
              onAddCard={() => setCreateCardColumnId(col.id)}
              onDeleteColumn={() => confirmDeleteColumn(col)}
              onCardPress={(card) => setViewCard(card)}
              onMoveCard={(card) => handleMoveCard(card)}
              onMoveCardToColumn={handleMoveCardToColumn}
            />
          ))
        )}
      </ScrollView>

      {/* Modals */}
      <AddColumnModal
        visible={showAddColumn}
        nextPosition={board.columns.length}
        onClose={() => setShowAddColumn(false)}
        onSubmit={(name) => {
          addColMutation.mutate(
            { name, position: board.columns.length },
            { onSuccess: () => setShowAddColumn(false) },
          );
        }}
        isPending={addColMutation.isPending}
      />

      {createCardColumnId && (
        <CreateCardModal
          visible
          columnId={createCardColumnId}
          users={users}
          clients={clients}
          onClose={() => setCreateCardColumnId(null)}
          onSubmit={(payload) =>
            createCardMutation.mutate(payload, { onSuccess: () => setCreateCardColumnId(null) })
          }
          isPending={createCardMutation.isPending}
        />
      )}

      {editCard && (
        <EditCardModal
          visible
          card={editCard}
          users={users}
          clients={clients}
          onClose={() => setEditCard(null)}
          onSubmit={(payload) =>
            updateCardMutation.mutate({ id: editCard.id, payload }, { onSuccess: () => setEditCard(null) })
          }
          isPending={updateCardMutation.isPending}
        />
      )}

      {viewCard && liveViewCard && (
        <CardDetailModal
          visible
          card={liveViewCard}
          board={board}
          users={users}
          clients={clients}
          nextColumn={nextCol}
          prevColumn={prevCol}
          onClose={() => setViewCard(null)}
          onEdit={() => { setViewCard(null); setEditCard(liveViewCard); }}
          onMove={() => handleMoveCard(liveViewCard)}
          onMoveToNext={nextCol ? () => { handleMoveCardToColumn(liveViewCard, nextCol.id); setViewCard(null); } : undefined}
          onMoveToPrev={prevCol ? () => { handleMoveCardToColumn(liveViewCard, prevCol.id); setViewCard(null); } : undefined}
          onDelete={() => confirmDeleteCard(liveViewCard)}
          onToggleItem={(id) => toggleItemMutation.mutate(id)}
          onAddItem={(text) => addItemMutation.mutate({ cardId: liveViewCard.id, text })}
          isDeleting={delCardMutation.isPending}
        />
      )}
    </View>
  );
}

/* ─── Column section ─── */

function KanbanColumnSection({
  column, nextColumn, prevColumn, users, clients, onAddCard, onDeleteColumn, onCardPress, onMoveCard, onMoveCardToColumn,
}: {
  column: KanbanColumn;
  nextColumn?: KanbanColumn;
  prevColumn?: KanbanColumn;
  users: TenantUser[];
  clients: ClientOption[];
  onAddCard: () => void;
  onDeleteColumn: () => void;
  onCardPress: (card: KanbanCard) => void;
  onMoveCard: (card: KanbanCard) => void;
  onMoveCardToColumn: (card: KanbanCard, targetColumnId: string) => void;
}) {
  const { iconSecondary, iconMuted, iconEmpty } = useAppTheme();
  const sortedCards = [...column.cards].sort((a, b) => a.position - b.position);

  return (
    <View className="mx-3 mt-4">
      <View className="flex-row items-center mb-2">
        <View className="w-2.5 h-2.5 rounded-full bg-brand/60 mr-2" />
        <Text className="text-content-primary font-bold text-sm flex-1">{column.name}</Text>
        <View className="bg-dark-raised border border-dark-border px-2 py-0.5 rounded-full mr-2">
          <Text className="text-content-muted text-[10px] font-bold">{column.cards.length}</Text>
        </View>
        <TouchableOpacity onPress={onAddCard} className="w-7 h-7 rounded-lg bg-dark-raised border border-dark-border items-center justify-center mr-1" hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
          <Ionicons name="add" size={14} color={iconSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onLongPress={onDeleteColumn} delayLongPress={700} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }} className="w-7 h-7 rounded-lg items-center justify-center">
          <Ionicons name="ellipsis-horizontal" size={14} color={iconMuted} />
        </TouchableOpacity>
      </View>

      {sortedCards.length === 0 ? (
        <TouchableOpacity onPress={onAddCard} className="border border-dashed border-dark-border rounded-2xl py-5 items-center">
          <Ionicons name="add-circle-outline" size={20} color={iconEmpty} />
          <Text className="text-content-muted text-xs mt-1.5">Añadir tarjeta</Text>
        </TouchableOpacity>
      ) : (
        <View className="gap-2">
          {sortedCards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              users={users}
              clients={clients}
              nextColumn={nextColumn}
              prevColumn={prevColumn}
              onPress={() => onCardPress(card)}
              onMove={() => onMoveCard(card)}
              onMoveToNext={nextColumn ? () => onMoveCardToColumn(card, nextColumn.id) : undefined}
              onMoveToPrev={prevColumn ? () => onMoveCardToColumn(card, prevColumn.id) : undefined}
            />
          ))}
          <TouchableOpacity onPress={onAddCard} className="flex-row items-center gap-1.5 py-2 px-1">
            <Ionicons name="add" size={14} color={iconMuted} />
            <Text className="text-content-muted text-xs">Nueva tarjeta</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/* ─── Card item (swipeable) ─── */

function CardItem({ card, users, clients, nextColumn, prevColumn, onPress, onMove, onMoveToNext, onMoveToPrev }: {
  card: KanbanCard;
  users: TenantUser[];
  clients: ClientOption[];
  nextColumn?: KanbanColumn;
  prevColumn?: KanbanColumn;
  onPress: () => void;
  onMove: () => void;
  onMoveToNext?: () => void;
  onMoveToPrev?: () => void;
}) {
  const { iconMuted } = useAppTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const thresholdHit = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => {
        if (Math.abs(gs.dx) < 8 || Math.abs(gs.dx) < Math.abs(gs.dy) * 1.2) return false;
        if (gs.dx > 0 && !nextColumn) return false;
        if (gs.dx < 0 && !prevColumn) return false;
        return true;
      },
      onPanResponderGrant: () => {
        thresholdHit.current = false;
      },
      onPanResponderMove: (_, gs) => {
        let dx = gs.dx;
        if (dx > 0 && !nextColumn) return;
        if (dx < 0 && !prevColumn) return;
        // Add rubber-band resistance past threshold
        if (Math.abs(dx) > SWIPE_THRESHOLD) {
          const excess = Math.abs(dx) - SWIPE_THRESHOLD;
          dx = (dx > 0 ? 1 : -1) * (SWIPE_THRESHOLD + excess * 0.25);
        }
        translateX.setValue(dx);
        if (!thresholdHit.current && Math.abs(gs.dx) >= SWIPE_THRESHOLD) {
          thresholdHit.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx >= SWIPE_THRESHOLD && nextColumn && onMoveToNext) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Animated.timing(translateX, { toValue: 380, duration: 200, useNativeDriver: false }).start(() => {
            translateX.setValue(0);
            onMoveToNext();
          });
        } else if (gs.dx <= -SWIPE_THRESHOLD && prevColumn && onMoveToPrev) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Animated.timing(translateX, { toValue: -380, duration: 200, useNativeDriver: false }).start(() => {
            translateX.setValue(0);
            onMoveToPrev();
          });
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: false, bounciness: 12, speed: 14 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: false }).start();
      },
    })
  ).current;

  const nextBgOpacity = translateX.interpolate({
    inputRange: [0, 16, SWIPE_THRESHOLD],
    outputRange: [0, 0.55, 1],
    extrapolate: "clamp",
  });
  const prevBgOpacity = translateX.interpolate({
    inputRange: [-SWIPE_THRESHOLD, -16, 0],
    outputRange: [1, 0.55, 0],
    extrapolate: "clamp",
  });

  const p = (card.priority as CardPriority) ?? "LOW";
  const pStyle = PRIORITY_STYLE[p] ?? PRIORITY_STYLE.LOW;
  const due = formatDue(card.dueDate);
  const cardClient = card.clientId ? clients.find((c) => c.id === card.clientId) : null;
  const checklistDone = card.checklist.filter((i) => i.completed).length;
  const checklistTotal = card.checklist.length;
  const assignees = users.filter((u) => card.assigneeIds?.includes(u.id));

  return (
    <View style={{ position: "relative" }}>
      {/* Swipe-right action: move to next column */}
      {nextColumn && (
        <Animated.View
          style={{
            position: "absolute", top: 0, bottom: 0, left: 0, right: 0,
            backgroundColor: "#059669", borderRadius: 16,
            justifyContent: "center", paddingLeft: 20,
            opacity: nextBgOpacity,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="arrow-forward-circle" size={22} color="rgba(255,255,255,0.95)" />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13, maxWidth: 180 }} numberOfLines={1}>
              {nextColumn.name}
            </Text>
          </View>
        </Animated.View>
      )}
      {/* Swipe-left action: move to prev column */}
      {prevColumn && (
        <Animated.View
          style={{
            position: "absolute", top: 0, bottom: 0, left: 0, right: 0,
            backgroundColor: "#D97706", borderRadius: 16,
            alignItems: "flex-end", justifyContent: "center", paddingRight: 20,
            opacity: prevBgOpacity,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13, maxWidth: 180 }} numberOfLines={1}>
              {prevColumn.name}
            </Text>
            <Ionicons name="arrow-back-circle" size={22} color="rgba(255,255,255,0.95)" />
          </View>
        </Animated.View>
      )}

      {/* Card — slides with finger */}
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <TouchableOpacity onPress={onPress} activeOpacity={0.78} className="bg-dark-surface border border-dark-border rounded-2xl p-3.5">
          <View className="flex-row items-start gap-2">
            <View className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${pStyle.dot}`} />
            <Text className="text-content-primary text-sm font-semibold flex-1 leading-5" numberOfLines={2}>{card.title}</Text>
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); onMove(); }} hitSlop={{ top: 6, bottom: 6, left: 10, right: 6 }}>
              <Ionicons name="ellipsis-horizontal-circle-outline" size={18} color={iconMuted} />
            </TouchableOpacity>
          </View>

          {card.description ? (
            <Text className="text-content-muted text-xs mt-1.5 ml-3.5 leading-4" numberOfLines={1}>{card.description}</Text>
          ) : null}

          {card.labels?.length > 0 && (
            <View className="flex-row flex-wrap gap-1 mt-2 ml-3.5">
              {card.labels.slice(0, 3).map((l) => (
                <View key={l} className="bg-brand/10 border border-brand/20 px-2 py-0.5 rounded-full">
                  <Text className="text-[10px] text-brand-light">{l}</Text>
                </View>
              ))}
            </View>
          )}

          {cardClient && (
            <View className="flex-row items-center gap-1 mt-1.5 ml-3.5">
              <Ionicons name="business-outline" size={11} color="#7C3AED" />
              <Text className="text-brand-light text-[11px] font-medium" numberOfLines={1}>{cardClient.name}</Text>
            </View>
          )}

          <View className="flex-row items-center mt-2.5 ml-3.5 gap-3">
            {assignees.length > 0 && (
              <View className="flex-row gap-0.5">
                {assignees.slice(0, 3).map((u) => <UserBubble key={u.id} user={u} size={6} />)}
                {assignees.length > 3 && (
                  <View className="w-6 h-6 rounded-full bg-dark-raised border border-dark-border items-center justify-center">
                    <Text className="text-content-muted text-[9px]">+{assignees.length - 3}</Text>
                  </View>
                )}
              </View>
            )}
            {checklistTotal > 0 && (
              <View className="flex-row items-center gap-1">
                <Ionicons name={checklistDone === checklistTotal ? "checkbox" : "checkbox-outline"} size={11} color={checklistDone === checklistTotal ? "#34D399" : iconMuted} />
                <Text className="text-content-muted text-xs">{checklistDone}/{checklistTotal}</Text>
              </View>
            )}
            {due.label && (
              <View className="flex-row items-center gap-1">
                <Ionicons name="calendar-outline" size={11} color={due.overdue ? "#EF4444" : due.soon ? "#F97316" : iconMuted} />
                <Text className={`text-xs ${due.overdue ? "text-red-400 font-semibold" : due.soon ? "text-orange-400" : "text-content-muted"}`}>{due.label}</Text>
              </View>
            )}
            {/* Swipe hint — only show if card has adjacent columns */}
            {(nextColumn || prevColumn) && (
              <View className="ml-auto flex-row items-center gap-0.5 opacity-30">
                {prevColumn && <Ionicons name="chevron-back" size={9} color={iconMuted} />}
                <Ionicons name="swap-horizontal-outline" size={10} color={iconMuted} />
                {nextColumn && <Ionicons name="chevron-forward" size={9} color={iconMuted} />}
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

/* ─── Add column modal ─── */

function AddColumnModal({ visible, nextPosition, onClose, onSubmit, isPending }: {
  visible: boolean; nextPosition: number;
  onClose: () => void; onSubmit: (name: string) => void; isPending: boolean;
}) {
  const { placeholder } = useAppTheme();
  const [name, setName] = useState("");
  const presets = ["Por hacer", "En progreso", "En revisión", "Hecho", "Archivado"];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 justify-end">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View className="bg-dark-surface border-t border-dark-border rounded-t-3xl px-5 pt-4 pb-10">
            <View className="w-10 h-1 bg-dark-border rounded-full self-center mb-4" />
            <Text className="text-content-primary font-bold text-base mb-4">Nueva columna</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              <View className="flex-row gap-2">
                {presets.map((p) => (
                  <TouchableOpacity key={p} onPress={() => setName(p)} className={`px-3 py-1.5 rounded-xl border ${name === p ? "bg-brand border-brand" : "bg-dark-raised border-dark-border"}`}>
                    <Text className={`text-xs font-medium ${name === p ? "text-white" : "text-content-secondary"}`}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TextInput
              className="bg-dark-raised border border-dark-border rounded-xl px-4 py-3 text-content-primary text-sm mb-4"
              placeholder="O escribe el nombre de la columna..."
              placeholderTextColor={placeholder}
              value={name} onChangeText={setName} autoFocus maxLength={50}
            />
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={onClose} className="flex-1 bg-dark-raised border border-dark-border rounded-2xl py-3.5 items-center">
                <Text className="text-content-secondary font-semibold">Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { if (name.trim()) { onSubmit(name.trim()); setName(""); } }} disabled={!name.trim() || isPending}
                className={`flex-1 rounded-2xl py-3.5 items-center ${!name.trim() || isPending ? "bg-brand/40" : "bg-brand"}`}>
                {isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-white font-semibold">Crear</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/* ─── Shared date trigger button ─── */

function DateTrigger({ dueDate, onPress, onClear }: {
  dueDate: string; onPress: () => void; onClear: () => void;
}) {
  const dueMeta = dueDate ? formatDue(dueDate) : null;
  const { iconMuted } = useAppTheme();
  return (
    <TouchableOpacity onPress={onPress} className="bg-dark-raised border border-dark-border rounded-xl px-4 py-3 flex-row items-center gap-3">
      <Ionicons name="calendar-outline" size={16} color={dueDate ? (dueMeta?.overdue ? "#EF4444" : dueMeta?.soon ? "#F97316" : "#7C3AED") : iconMuted} />
      {dueDate ? (
        <>
          <Text className={`flex-1 text-sm font-medium ${dueMeta?.overdue ? "text-red-400" : dueMeta?.soon ? "text-orange-400" : "text-content-primary"}`}>
            {new Date(dueDate + "T00:00:00").toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "long" })}
          </Text>
          <TouchableOpacity onPress={(e) => { e.stopPropagation(); onClear(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={iconMuted} />
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text className="flex-1 text-sm text-content-muted">Sin fecha (opcional)</Text>
          <Ionicons name="chevron-forward" size={14} color={iconMuted} />
        </>
      )}
    </TouchableOpacity>
  );
}

/* ─── Shared card form fields ─── */

function CardFormFields({
  title, setTitle, description, setDescription,
  priority, setPriority, dueDate, setDueDate,
  assigneeIds, setAssigneeIds, clientId, setClientId,
  users, clients, autoFocus, placeholder,
}: {
  title: string; setTitle: (s: string) => void;
  description: string; setDescription: (s: string) => void;
  priority: CardPriority; setPriority: (p: CardPriority) => void;
  dueDate: string; setDueDate: (s: string) => void;
  assigneeIds: string[]; setAssigneeIds: (ids: string[]) => void;
  clientId: string | undefined; setClientId: (id: string | undefined) => void;
  users: TenantUser[];
  clients: ClientOption[];
  autoFocus?: boolean;
  placeholder: string;
}) {
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  return (
    <>
      <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">
        Título <Text className="text-red-400">*</Text>
      </Text>
      <TextInput
        className="bg-dark-raised border border-dark-border rounded-xl px-4 py-3 text-content-primary text-sm mb-4"
        placeholder="¿Qué hay que hacer?"
        placeholderTextColor={placeholder}
        value={title} onChangeText={setTitle} autoFocus={autoFocus} maxLength={200}
      />

      <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">Descripción</Text>
      <TextInput
        className="bg-dark-raised border border-dark-border rounded-xl px-4 py-3 text-content-primary text-sm mb-4"
        placeholder="Detalles adicionales (opcional)"
        placeholderTextColor={placeholder}
        value={description} onChangeText={setDescription}
        multiline numberOfLines={3} textAlignVertical="top" style={{ minHeight: 72 }}
      />

      <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">Prioridad</Text>
      <View className="flex-row gap-2 mb-4">
        {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as CardPriority[]).map((p) => {
          const s = PRIORITY_STYLE[p];
          const active = priority === p;
          return (
            <TouchableOpacity key={p} onPress={() => { setPriority(p); Haptics.selectionAsync(); }}
              className={`flex-1 py-2 rounded-xl border items-center ${active ? s.badge : "bg-dark-raised border-dark-border"}`}>
              <Text className={`text-xs font-bold ${active ? s.text : "text-content-muted"}`}>{PRIORITY_LABEL[p]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">Fecha límite</Text>
      <View className="mb-4">
        <DateTrigger dueDate={dueDate} onPress={() => setDatePickerOpen(true)} onClear={() => setDueDate("")} />
      </View>

      <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">Asignados</Text>
      <View className="mb-4">
        <AssigneeSelector assigneeIds={assigneeIds} users={users} onChange={setAssigneeIds} />
      </View>

      <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">Cliente</Text>
      <ClientSelector clientId={clientId} clients={clients} onChange={setClientId} />

      <DatePickerSheet
        visible={datePickerOpen}
        value={dueDate}
        onConfirm={setDueDate}
        onClose={() => setDatePickerOpen(false)}
      />
    </>
  );
}

/* ─── Create card modal ─── */

function CreateCardModal({ visible, columnId, users, clients, onClose, onSubmit, isPending }: {
  visible: boolean; columnId: string; users: TenantUser[]; clients: ClientOption[];
  onClose: () => void; onSubmit: (p: CreateCardPayload) => void; isPending: boolean;
}) {
  const { placeholder } = useAppTheme();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<CardPriority>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [clientId, setClientId] = useState<string | undefined>();

  function handleSubmit() {
    if (!title.trim()) return;
    onSubmit({ columnId, title: title.trim(), description: description.trim() || undefined, priority, dueDate: dueDate || undefined, assigneeIds, clientId });
    setTitle(""); setDescription(""); setPriority("MEDIUM"); setDueDate(""); setAssigneeIds([]); setClientId(undefined);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 justify-end">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View className="bg-dark-surface border-t border-dark-border rounded-t-3xl">
            <View className="w-10 h-1 bg-dark-border rounded-full self-center mt-3" />
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-border">
              <TouchableOpacity onPress={onClose}><Text className="text-content-muted text-sm">Cancelar</Text></TouchableOpacity>
              <Text className="text-content-primary font-bold">Nueva tarjeta</Text>
              <TouchableOpacity onPress={handleSubmit} disabled={!title.trim() || isPending}
                className={`px-4 py-1.5 rounded-xl ${!title.trim() || isPending ? "bg-brand/40" : "bg-brand"}`}>
                {isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-white font-semibold text-sm">Crear</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
              <CardFormFields
                title={title} setTitle={setTitle}
                description={description} setDescription={setDescription}
                priority={priority} setPriority={setPriority}
                dueDate={dueDate} setDueDate={setDueDate}
                assigneeIds={assigneeIds} setAssigneeIds={setAssigneeIds}
                clientId={clientId} setClientId={setClientId}
                users={users} clients={clients} autoFocus placeholder={placeholder}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/* ─── Edit card modal ─── */

function EditCardModal({ visible, card, users, clients, onClose, onSubmit, isPending }: {
  visible: boolean; card: KanbanCard; users: TenantUser[]; clients: ClientOption[];
  onClose: () => void; onSubmit: (p: UpdateCardPayload) => void; isPending: boolean;
}) {
  const { placeholder } = useAppTheme();
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [priority, setPriority] = useState<CardPriority>((card.priority as CardPriority) ?? "MEDIUM");
  const [dueDate, setDueDate] = useState(card.dueDate ? card.dueDate.substring(0, 10) : "");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(card.assigneeIds ?? []);
  const [clientId, setClientId] = useState<string | undefined>(card.clientId);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 justify-end">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View className="bg-dark-surface border-t border-dark-border rounded-t-3xl">
            <View className="w-10 h-1 bg-dark-border rounded-full self-center mt-3" />
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-border">
              <TouchableOpacity onPress={onClose}><Text className="text-content-muted text-sm">Cancelar</Text></TouchableOpacity>
              <Text className="text-content-primary font-bold">Editar tarjeta</Text>
              <TouchableOpacity
                onPress={() => onSubmit({ title: title.trim(), description: description.trim() || undefined, priority, dueDate: dueDate || undefined, assigneeIds, clientId })}
                disabled={!title.trim() || isPending}
                className={`px-4 py-1.5 rounded-xl ${!title.trim() || isPending ? "bg-brand/40" : "bg-brand"}`}>
                {isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-white font-semibold text-sm">Guardar</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
              <CardFormFields
                title={title} setTitle={setTitle}
                description={description} setDescription={setDescription}
                priority={priority} setPriority={setPriority}
                dueDate={dueDate} setDueDate={setDueDate}
                assigneeIds={assigneeIds} setAssigneeIds={setAssigneeIds}
                clientId={clientId} setClientId={setClientId}
                users={users} clients={clients} placeholder={placeholder}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/* ─── Card detail modal ─── */

function CardDetailModal({
  visible, card, board, users, clients, nextColumn, prevColumn,
  onClose, onEdit, onMove, onMoveToNext, onMoveToPrev, onDelete, onToggleItem, onAddItem, isDeleting,
}: {
  visible: boolean; card: KanbanCard; board: Board; users: TenantUser[]; clients: ClientOption[];
  nextColumn?: KanbanColumn; prevColumn?: KanbanColumn;
  onClose: () => void; onEdit: () => void; onMove: () => void;
  onMoveToNext?: () => void; onMoveToPrev?: () => void;
  onDelete: () => void;
  onToggleItem: (id: string) => void; onAddItem: (text: string) => void; isDeleting: boolean;
}) {
  const { iconSecondary, iconMuted, placeholder } = useAppTheme();
  const [newItemText, setNewItemText] = useState("");
  const [aiSheet, setAiSheet] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [copied, setCopied] = useState(false);
  const due = formatDue(card.dueDate);
  const p = (card.priority as CardPriority) ?? "LOW";
  const pStyle = PRIORITY_STYLE[p];
  const checklistDone = card.checklist.filter((i) => i.completed).length;
  const column = board.columns.find((c) => c.id === card.columnId);
  const assignees = users.filter((u) => card.assigneeIds?.includes(u.id));
  const cardClient = card.clientId ? clients.find((c) => c.id === card.clientId) : null;

  const aiMutation = useMutation({
    mutationFn: () =>
      aiAssist({
        task: "GENERATE_CARD_PROMPT",
        context: {
          cardTitle: card.title,
          cardDescription: card.description ?? undefined,
          cardChecklist: card.checklist.map((i) => i.text),
          cardPriority: PRIORITY_LABEL[(card.priority as CardPriority) ?? "LOW"],
          boardName: board.name,
          clientName: cardClient?.name ?? undefined,
        },
      }),
    onSuccess: (result) => {
      setAiResult(result);
      setAiSheet(true);
    },
    onError: () => {
      Alert.alert("Error", "No se pudo generar el prompt. Inténtalo de nuevo.");
    },
  });

  async function handleCopy() {
    await Clipboard.setStringAsync(aiResult);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  }

  function submitItem() {
    if (!newItemText.trim()) return;
    onAddItem(newItemText.trim());
    setNewItemText("");
    Haptics.selectionAsync();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/60 justify-end" onPress={onClose}>
        <View className="bg-dark-surface border-t border-dark-border rounded-t-3xl" style={{ maxHeight: "90%" }} onStartShouldSetResponder={() => true}>
          <DismissHandle onDismiss={onClose} />

          <View className="flex-row items-center justify-between px-5 py-3 border-b border-dark-border">
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={iconSecondary} />
            </TouchableOpacity>
            <Text className="text-content-primary font-bold flex-1 text-center mx-4" numberOfLines={1}>{card.title}</Text>
            <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="bg-dark-raised border border-dark-border rounded-xl px-3 py-1.5 flex-row items-center gap-1.5">
              <Ionicons name="pencil-outline" size={14} color={iconSecondary} />
              <Text className="text-content-secondary text-xs font-medium">Editar</Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            {/* Meta badges */}
            <View className="flex-row flex-wrap gap-2 mb-4">
              <View className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full border ${pStyle.badge}`}>
                <View className={`w-1.5 h-1.5 rounded-full ${pStyle.dot}`} />
                <Text className={`text-xs font-semibold ${pStyle.text}`}>{PRIORITY_LABEL[p]}</Text>
              </View>
              {column && (
                <TouchableOpacity onPress={onMove} className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-brand/10 border border-brand/20">
                  <Text className="text-xs text-brand-light">{column.name}</Text>
                  <Ionicons name="swap-horizontal-outline" size={10} color="#A78BFA" />
                </TouchableOpacity>
              )}
              {due.label && (
                <View className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full border ${due.overdue ? "bg-red-500/15 border-red-500/30" : due.soon ? "bg-orange-500/15 border-orange-500/30" : "bg-dark-raised border-dark-border"}`}>
                  <Ionicons name="calendar-outline" size={10} color={due.overdue ? "#EF4444" : due.soon ? "#F97316" : iconMuted} />
                  <Text className={`text-xs ${due.overdue ? "text-red-400 font-semibold" : due.soon ? "text-orange-400" : "text-content-muted"}`}>{due.label}</Text>
                </View>
              )}
              {cardClient && (
                <View className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-brand/10 border border-brand/20">
                  <Ionicons name="business-outline" size={10} color="#A78BFA" />
                  <Text className="text-xs text-brand-light font-medium" numberOfLines={1}>{cardClient.name}</Text>
                </View>
              )}
            </View>

            {/* Stage navigation */}
            {(prevColumn || nextColumn) && (
              <View className="mb-5">
                <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2.5">Mover a etapa</Text>
                <View className="flex-row gap-2.5">
                  {prevColumn ? (
                    <TouchableOpacity
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onMoveToPrev?.(); }}
                      className="flex-1 flex-row items-center gap-2 bg-amber-500/10 border border-amber-500/35 rounded-2xl px-3 py-3"
                    >
                      <Ionicons name="arrow-back-circle-outline" size={18} color="#F59E0B" />
                      <Text className="text-amber-400 text-xs font-bold flex-1" numberOfLines={1}>{prevColumn.name}</Text>
                    </TouchableOpacity>
                  ) : <View className="flex-1" />}
                  {nextColumn ? (
                    <TouchableOpacity
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onMoveToNext?.(); }}
                      className="flex-1 flex-row items-center justify-end gap-2 bg-emerald-500/10 border border-emerald-500/35 rounded-2xl px-3 py-3"
                    >
                      <Text className="text-emerald-400 text-xs font-bold flex-1 text-right" numberOfLines={1}>{nextColumn.name}</Text>
                      <Ionicons name="arrow-forward-circle-outline" size={18} color="#34D399" />
                    </TouchableOpacity>
                  ) : <View className="flex-1" />}
                </View>
                <TouchableOpacity
                  onPress={onMove}
                  className="mt-2 flex-row items-center justify-center gap-1.5 py-2"
                >
                  <Ionicons name="swap-horizontal-outline" size={13} color="#6B7280" />
                  <Text className="text-content-muted text-xs">Ver todas las etapas</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Assignees */}
            {assignees.length > 0 && (
              <View className="mb-4">
                <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">Asignados</Text>
                <View className="flex-row flex-wrap gap-2">
                  {assignees.map((u) => (
                    <View key={u.id} className="flex-row items-center gap-2 bg-dark-raised border border-dark-border rounded-full pl-1 pr-3 py-1">
                      <UserBubble user={u} size={6} />
                      <Text className="text-content-secondary text-xs font-medium">{u.fullName.split(" ")[0]}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Description */}
            {card.description && (
              <>
                <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-1.5">Descripción</Text>
                <Text className="text-content-secondary text-sm leading-5 mb-4">{card.description}</Text>
              </>
            )}

            {/* Checklist */}
            <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">
              Checklist{card.checklist.length > 0 ? ` (${checklistDone}/${card.checklist.length})` : ""}
            </Text>
            {card.checklist.length > 0 && (
              <View className="bg-dark-raised rounded-full h-1.5 mb-3 overflow-hidden">
                <View className="bg-emerald-400 h-full rounded-full" style={{ width: `${(checklistDone / card.checklist.length) * 100}%` }} />
              </View>
            )}
            {[...card.checklist].sort((a, b) => a.position - b.position).map((item) => (
              <ChecklistRow key={item.id} item={item} onToggle={() => onToggleItem(item.id)} />
            ))}

            <View className="flex-row items-center gap-2 mt-2 bg-dark-raised border border-dark-border rounded-xl px-3">
              <Ionicons name="add-circle-outline" size={16} color={iconMuted} />
              <TextInput
                className="flex-1 py-3 text-content-primary text-sm"
                placeholder="Añadir elemento..."
                placeholderTextColor={placeholder}
                value={newItemText} onChangeText={setNewItemText}
                onSubmitEditing={submitItem} returnKeyType="done"
              />
              {newItemText.trim().length > 0 && (
                <TouchableOpacity onPress={submitItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#7C3AED" />
                </TouchableOpacity>
              )}
            </View>

            {/* AI Prompt Button */}
            <View className="mt-6 border-t border-dark-border/50 pt-5">
              <TouchableOpacity
                onPress={() => aiMutation.mutate()}
                disabled={aiMutation.isPending}
                className="bg-brand/10 border border-brand/30 rounded-2xl py-3.5 flex-row items-center justify-center gap-2 mb-3">
                {aiMutation.isPending ? (
                  <ActivityIndicator size="small" color="#7C3AED" />
                ) : (
                  <>
                    <Ionicons name="sparkles-outline" size={16} color="#A78BFA" />
                    <Text className="text-brand-light font-semibold text-sm">Generar prompt con IA</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Delete */}
              <TouchableOpacity onPress={onDelete} disabled={isDeleting}
                className="bg-red-500/10 border border-red-500/30 rounded-2xl py-3.5 flex-row items-center justify-center gap-2">
                {isDeleting ? <ActivityIndicator size="small" color="#EF4444" /> : (
                  <>
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    <Text className="text-red-400 font-semibold text-sm">Eliminar tarjeta</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Pressable>

      {/* AI Result Sheet */}
      <Modal visible={aiSheet} animationType="slide" transparent onRequestClose={() => setAiSheet(false)}>
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={() => setAiSheet(false)}>
          <View
            className="bg-dark-surface border-t border-dark-border rounded-t-3xl"
            style={{ maxHeight: "88%" }}
            onStartShouldSetResponder={() => true}
          >
            <DismissHandle onDismiss={() => setAiSheet(false)} />
            {/* Header */}
            <View className="flex-row items-center justify-between px-5 py-3 border-b border-dark-border">
              <View className="flex-row items-center gap-2">
                <Ionicons name="sparkles" size={16} color="#A78BFA" />
                <Text className="text-content-primary font-bold text-base">Prompt generado con IA</Text>
              </View>
              <TouchableOpacity onPress={() => setAiSheet(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={iconSecondary} />
              </TouchableOpacity>
            </View>
            {/* Scrollable markdown content */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
              showsVerticalScrollIndicator
              indicatorStyle="white"
            >
              <MarkdownText text={aiResult} />
            </ScrollView>
            {/* Sticky action bar */}
            <View className="border-t border-dark-border px-4 pt-3 pb-5 flex-row gap-3">
              <TouchableOpacity
                onPress={() => { aiMutation.mutate(); Haptics.selectionAsync(); }}
                disabled={aiMutation.isPending}
                className="flex-1 bg-dark-raised border border-brand/40 rounded-2xl py-3 flex-row items-center justify-center gap-2"
              >
                {aiMutation.isPending ? (
                  <ActivityIndicator size="small" color="#A78BFA" />
                ) : (
                  <Ionicons name="refresh-outline" size={15} color="#A78BFA" />
                )}
                <Text className="text-brand-light font-semibold text-sm">Más ideas</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCopy}
                disabled={aiMutation.isPending}
                className={`flex-1 rounded-2xl py-3 flex-row items-center justify-center gap-2 ${
                  copied ? "bg-emerald-500/20 border border-emerald-500/40" : "bg-brand border border-brand/60"
                }`}
              >
                <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={15} color={copied ? "#34D399" : "#fff"} />
                <Text className={`font-semibold text-sm ${copied ? "text-emerald-400" : "text-white"}`}>
                  {copied ? "¡Copiado!" : "Copiar"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </Modal>
  );
}

/* ─── Markdown renderer ─── */

function renderInline(text: string) {
  // Split on **bold** markers
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <Text key={i} className="text-content-primary font-semibold">
          {part.slice(2, -2)}
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <View>
      {lines.map((line, i) => {
        if (line.startsWith("### ")) {
          return (
            <Text key={i} className="text-content-primary font-bold text-sm mt-4 mb-1">
              {line.slice(4)}
            </Text>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <Text key={i} className="text-brand-light font-bold text-base mt-5 mb-1.5">
              {line.slice(3)}
            </Text>
          );
        }
        if (line.startsWith("# ")) {
          return (
            <Text key={i} className="text-brand-light font-bold text-lg mt-5 mb-2">
              {line.slice(2)}
            </Text>
          );
        }
        const numMatch = line.match(/^(\d+)\.\s(.+)/);
        if (numMatch) {
          return (
            <View key={i} className="flex-row gap-2 mt-1.5 pl-1">
              <Text className="text-brand-light font-bold text-sm w-5 shrink-0">{numMatch[1]}.</Text>
              <Text className="flex-1 text-content-secondary text-sm leading-5">{renderInline(numMatch[2])}</Text>
            </View>
          );
        }
        if (line.match(/^[-*]\s/)) {
          return (
            <View key={i} className="flex-row gap-2 mt-1.5 pl-1">
              <Text className="text-brand-light text-sm font-bold w-4 shrink-0">•</Text>
              <Text className="flex-1 text-content-secondary text-sm leading-5">{renderInline(line.slice(2))}</Text>
            </View>
          );
        }
        if (!line.trim()) return <View key={i} className="h-3" />;
        if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
          return (
            <Text key={i} className="text-content-primary font-semibold text-sm mt-3">
              {line.slice(2, -2)}
            </Text>
          );
        }
        return (
          <Text key={i} className="text-content-secondary text-sm leading-5">
            {renderInline(line)}
          </Text>
        );
      })}
    </View>
  );
}

/* ─── Checklist row ─── */

function ChecklistRow({ item, onToggle }: { item: ChecklistItem; onToggle: () => void }) {
  return (
    <TouchableOpacity onPress={onToggle} className="flex-row items-start gap-3 py-2.5 border-b border-dark-border/40" activeOpacity={0.7}>
      <View className={`w-5 h-5 rounded-md border mt-0.5 items-center justify-center flex-shrink-0 ${item.completed ? "bg-emerald-500 border-emerald-500" : "border-dark-border bg-dark-raised"}`}>
        {item.completed && <Ionicons name="checkmark" size={12} color="#fff" />}
      </View>
      <Text className={`flex-1 text-sm leading-5 ${item.completed ? "text-content-muted line-through" : "text-content-primary"}`}>
        {item.text}
      </Text>
    </TouchableOpacity>
  );
}
