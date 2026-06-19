import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ActionSheetIOS,
} from "react-native";
import { useState, useMemo } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  getBoard,
  addColumn,
  deleteColumn,
  createCard,
  updateCard,
  moveCard,
  deleteCard,
  addChecklistItem,
  toggleChecklistItem,
} from "@/api/kanban.api";
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

const PRIORITY_STYLE: Record<CardPriority, { dot: string; text: string; badge: string }> = {
  LOW:      { dot: "bg-content-muted",  text: "text-content-muted",  badge: "bg-dark-raised border-dark-border" },
  MEDIUM:   { dot: "bg-amber-400",      text: "text-amber-400",      badge: "bg-amber-500/15 border-amber-500/30" },
  HIGH:     { dot: "bg-orange-500",     text: "text-orange-400",     badge: "bg-orange-500/15 border-orange-500/30" },
  CRITICAL: { dot: "bg-red-500",        text: "text-red-400",        badge: "bg-red-500/15 border-red-500/30" },
};

const PRIORITY_LABEL: Record<CardPriority, string> = {
  LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", CRITICAL: "Crítica",
};

const BOARD_KEY = (id: string) => ["boards", "detail", id] as const;

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

/* ─── Screen ─── */

export default function BoardDetailScreen() {
  const { boardId } = useLocalSearchParams<{ boardId: string }>();
  const qc = useQueryClient();

  const [showAddColumn, setShowAddColumn] = useState(false);
  const [createCardColumnId, setCreateCardColumnId] = useState<string | null>(null);
  const [editCard, setEditCard] = useState<KanbanCard | null>(null);
  const [viewCard, setViewCard] = useState<KanbanCard | null>(null);

  const { data: board, isLoading, isRefetching, refetch } = useQuery({
    queryKey: BOARD_KEY(boardId),
    queryFn: () => getBoard(boardId),
    staleTime: 0,
    retry: false,
    enabled: !!boardId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: BOARD_KEY(boardId) });

  const addColMutation = useMutation({
    mutationFn: ({ name, position }: { name: string; position: number }) =>
      addColumn(boardId, name, position),
    onSuccess: () => { invalidate(); setShowAddColumn(false); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
    onError: () => Alert.alert("Error", "No se pudo crear la columna."),
  });

  const delColMutation = useMutation({
    mutationFn: deleteColumn,
    onSuccess: invalidate,
    onError: () => Alert.alert("Error", "No se pudo eliminar la columna."),
  });

  const createCardMutation = useMutation({
    mutationFn: (payload: CreateCardPayload) => createCard(payload),
    onSuccess: () => { invalidate(); setCreateCardColumnId(null); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
    onError: () => Alert.alert("Error", "No se pudo crear la tarjeta."),
  });

  const updateCardMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCardPayload }) => updateCard(id, payload),
    onSuccess: () => { invalidate(); setEditCard(null); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
    onError: () => Alert.alert("Error", "No se pudo actualizar la tarjeta."),
  });

  const moveCardMutation = useMutation({
    mutationFn: ({ cardId, targetColumnId }: { cardId: string; targetColumnId: string }) =>
      moveCard(cardId, { targetColumnId }),
    onSuccess: () => { invalidate(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
    onError: () => Alert.alert("Error", "No se pudo mover la tarjeta."),
  });

  const delCardMutation = useMutation({
    mutationFn: deleteCard,
    onSuccess: () => { invalidate(); setViewCard(null); },
    onError: () => Alert.alert("Error", "No se pudo eliminar la tarjeta."),
  });

  const toggleItemMutation = useMutation({
    mutationFn: toggleChecklistItem,
    onSuccess: invalidate,
  });

  const addItemMutation = useMutation({
    mutationFn: ({ cardId, text }: { cardId: string; text: string }) =>
      addChecklistItem(cardId, text),
    onSuccess: invalidate,
  });

  // Find the current card in board data (keeps viewCard fresh after invalidation)
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
    const options = columns.filter((c) => c.id !== card.columnId).map((c) => c.name);
    if (options.length === 0) { Alert.alert("Sin columnas", "Crea otra columna primero."); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...options, "Cancelar"], cancelButtonIndex: options.length, title: "Mover a..." },
        (idx) => {
          if (idx < options.length) {
            const target = columns.filter((c) => c.id !== card.columnId)[idx];
            moveCardMutation.mutate({ cardId: card.id, targetColumnId: target.id });
          }
        }
      );
    } else {
      Alert.alert("Mover a...", undefined, [
        ...columns
          .filter((c) => c.id !== card.columnId)
          .map((c) => ({
            text: c.name,
            onPress: () => moveCardMutation.mutate({ cardId: card.id, targetColumnId: c.id }),
          })),
        { text: "Cancelar", style: "cancel" as const },
      ]);
    }
  }

  function handleCardOptions(card: KanbanCard) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Ver detalles", "Mover a columna", "Editar", "Eliminar", "Cancelar"],
          destructiveButtonIndex: 3,
          cancelButtonIndex: 4,
        },
        (idx) => {
          if (idx === 0) setViewCard(card);
          else if (idx === 1) handleMoveCard(card);
          else if (idx === 2) setEditCard(card);
          else if (idx === 3) confirmDeleteCard(card);
        }
      );
    } else {
      Alert.alert(card.title, undefined, [
        { text: "Ver detalles", onPress: () => setViewCard(card) },
        { text: "Mover a columna", onPress: () => handleMoveCard(card) },
        { text: "Editar", onPress: () => setEditCard(card) },
        { text: "Eliminar", style: "destructive", onPress: () => confirmDeleteCard(card) },
        { text: "Cancelar", style: "cancel" },
      ]);
    }
  }

  function confirmDeleteCard(card: KanbanCard) {
    Alert.alert(`Eliminar "${card.title}"`, "Esta acción no se puede deshacer.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => delCardMutation.mutate(card.id) },
    ]);
  }

  function confirmDeleteColumn(col: KanbanColumn) {
    if (col.cards.length > 0) {
      Alert.alert("Columna con tarjetas", `La columna "${col.name}" tiene ${col.cards.length} tarjeta(s). Muévelas primero antes de eliminar.`);
      return;
    }
    Alert.alert(`Eliminar columna "${col.name}"`, "Esta acción no se puede deshacer.", [
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

  return (
    <View className="flex-1 bg-dark-bg">
      <StatusBar barStyle="light-content" backgroundColor="#0C0C14" />

      {/* Header */}
      <View className="bg-dark-surface border-b border-dark-border px-4 pt-14 pb-3">
        <View className="flex-row items-center gap-3">
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={22} color="#8888A0" />
          </TouchableOpacity>
          <View className="flex-1 min-w-0">
            <Text className="text-content-primary font-bold text-base" numberOfLines={1}>
              {board.name}
            </Text>
            <Text className="text-content-muted text-xs">
              {board.columns.length} columnas · {totalCards} tarjetas
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => { setShowAddColumn(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            className="flex-row items-center gap-1 bg-dark-raised border border-dark-border px-2.5 py-1.5 rounded-xl"
          >
            <Ionicons name="add" size={14} color="#8888A0" />
            <Text className="text-content-muted text-xs">Columna</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Board content — vertical columns */}
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#7C3AED" />
        }
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {sortedColumns.length === 0 ? (
          <View className="items-center justify-center py-24 px-8">
            <Ionicons name="layers-outline" size={48} color="#2A2A3C" />
            <Text className="text-content-primary font-bold text-base mt-4 text-center">
              Sin columnas
            </Text>
            <Text className="text-content-muted text-sm text-center mt-2 leading-5">
              Añade columnas para organizar tus tarjetas (ej. "Por hacer", "En progreso", "Hecho").
            </Text>
            <TouchableOpacity
              onPress={() => setShowAddColumn(true)}
              className="mt-5 bg-brand px-5 py-2.5 rounded-xl flex-row items-center gap-2"
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text className="text-white font-semibold text-sm">Añadir columna</Text>
            </TouchableOpacity>
          </View>
        ) : (
          sortedColumns.map((col) => (
            <KanbanColumnSection
              key={col.id}
              column={col}
              onAddCard={() => setCreateCardColumnId(col.id)}
              onDeleteColumn={() => confirmDeleteColumn(col)}
              onCardPress={(card) => setViewCard(card)}
              onCardLongPress={(card) => handleCardOptions(card)}
              onMoveCard={(card) => handleMoveCard(card)}
            />
          ))
        )}
      </ScrollView>

      {/* Modals */}
      <AddColumnModal
        visible={showAddColumn}
        nextPosition={board.columns.length}
        onClose={() => setShowAddColumn(false)}
        onSubmit={(name) => addColMutation.mutate({ name, position: board.columns.length })}
        isPending={addColMutation.isPending}
      />

      {createCardColumnId && (
        <CreateCardModal
          visible
          columnId={createCardColumnId}
          onClose={() => setCreateCardColumnId(null)}
          onSubmit={(payload) => createCardMutation.mutate(payload)}
          isPending={createCardMutation.isPending}
        />
      )}

      {editCard && (
        <EditCardModal
          visible
          card={editCard}
          onClose={() => setEditCard(null)}
          onSubmit={(payload) => updateCardMutation.mutate({ id: editCard.id, payload })}
          isPending={updateCardMutation.isPending}
        />
      )}

      {viewCard && liveViewCard && (
        <CardDetailModal
          visible
          card={liveViewCard}
          board={board}
          onClose={() => setViewCard(null)}
          onEdit={() => { setViewCard(null); setEditCard(liveViewCard); }}
          onMove={() => { handleMoveCard(liveViewCard); }}
          onDelete={() => confirmDeleteCard(liveViewCard)}
          onToggleItem={(itemId) => toggleItemMutation.mutate(itemId)}
          onAddItem={(text) => addItemMutation.mutate({ cardId: liveViewCard.id, text })}
        />
      )}
    </View>
  );
}

/* ─── Column section ─── */

function KanbanColumnSection({
  column,
  onAddCard,
  onDeleteColumn,
  onCardPress,
  onCardLongPress,
  onMoveCard,
}: {
  column: KanbanColumn;
  onAddCard: () => void;
  onDeleteColumn: () => void;
  onCardPress: (card: KanbanCard) => void;
  onCardLongPress: (card: KanbanCard) => void;
  onMoveCard: (card: KanbanCard) => void;
}) {
  const sortedCards = [...column.cards].sort((a, b) => a.position - b.position);

  return (
    <View className="mx-3 mt-4">
      {/* Column header */}
      <View className="flex-row items-center mb-2">
        <View className="w-2.5 h-2.5 rounded-full bg-brand/60 mr-2" />
        <Text className="text-content-primary font-bold text-sm flex-1">{column.name}</Text>
        <View className="bg-dark-raised border border-dark-border px-2 py-0.5 rounded-full mr-2">
          <Text className="text-content-muted text-[10px] font-bold">{column.cards.length}</Text>
        </View>
        <TouchableOpacity
          onPress={onAddCard}
          className="w-7 h-7 rounded-lg bg-dark-raised border border-dark-border items-center justify-center mr-1"
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Ionicons name="add" size={14} color="#8888A0" />
        </TouchableOpacity>
        <TouchableOpacity
          onLongPress={onDeleteColumn}
          delayLongPress={700}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          className="w-7 h-7 rounded-lg items-center justify-center"
        >
          <Ionicons name="ellipsis-horizontal" size={14} color="#4A4A5C" />
        </TouchableOpacity>
      </View>

      {/* Cards */}
      {sortedCards.length === 0 ? (
        <TouchableOpacity
          onPress={onAddCard}
          className="border border-dashed border-dark-border rounded-2xl py-5 items-center"
        >
          <Ionicons name="add-circle-outline" size={20} color="#2A2A3C" />
          <Text className="text-content-muted text-xs mt-1.5">Añadir tarjeta</Text>
        </TouchableOpacity>
      ) : (
        <View className="gap-2">
          {sortedCards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              onPress={() => onCardPress(card)}
              onLongPress={() => onCardLongPress(card)}
              onMove={() => onMoveCard(card)}
            />
          ))}
          <TouchableOpacity
            onPress={onAddCard}
            className="flex-row items-center gap-1.5 py-2 px-1"
          >
            <Ionicons name="add" size={14} color="#4A4A5C" />
            <Text className="text-content-muted text-xs">Nueva tarjeta</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/* ─── Card item ─── */

function CardItem({
  card,
  onPress,
  onLongPress,
  onMove,
}: {
  card: KanbanCard;
  onPress: () => void;
  onLongPress: () => void;
  onMove: () => void;
}) {
  const p = card.priority ?? "LOW";
  const pStyle = PRIORITY_STYLE[p as CardPriority] ?? PRIORITY_STYLE.LOW;
  const due = formatDue(card.dueDate);
  const checklistDone = card.checklist.filter((i) => i.completed).length;
  const checklistTotal = card.checklist.length;

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.75}
      className="bg-dark-surface border border-dark-border rounded-2xl p-3.5"
    >
      {/* Priority dot + title */}
      <View className="flex-row items-start gap-2">
        <View className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${pStyle.dot}`} />
        <Text className="text-content-primary text-sm font-semibold flex-1 leading-5" numberOfLines={2}>
          {card.title}
        </Text>
        <TouchableOpacity onPress={onMove} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Ionicons name="arrow-forward-circle-outline" size={18} color="#4A4A5C" />
        </TouchableOpacity>
      </View>

      {/* Description */}
      {card.description ? (
        <Text className="text-content-muted text-xs mt-1.5 ml-3.5 leading-4" numberOfLines={1}>
          {card.description}
        </Text>
      ) : null}

      {/* Labels */}
      {card.labels?.length > 0 && (
        <View className="flex-row flex-wrap gap-1 mt-2 ml-3.5">
          {card.labels.slice(0, 3).map((l) => (
            <View key={l} className="bg-brand/10 border border-brand/20 px-2 py-0.5 rounded-full">
              <Text className="text-[10px] text-brand-light">{l}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Footer: checklist + due */}
      {(checklistTotal > 0 || due.label) && (
        <View className="flex-row items-center gap-3 mt-2.5 ml-3.5">
          {checklistTotal > 0 && (
            <View className="flex-row items-center gap-1">
              <Ionicons
                name={checklistDone === checklistTotal ? "checkbox" : "checkbox-outline"}
                size={11}
                color={checklistDone === checklistTotal ? "#34D399" : "#4A4A5C"}
              />
              <Text className="text-content-muted text-xs">{checklistDone}/{checklistTotal}</Text>
            </View>
          )}
          {due.label && (
            <View className="flex-row items-center gap-1">
              <Ionicons
                name="calendar-outline"
                size={11}
                color={due.overdue ? "#EF4444" : due.soon ? "#F97316" : "#4A4A5C"}
              />
              <Text className={`text-xs ${due.overdue ? "text-red-400 font-semibold" : due.soon ? "text-orange-400" : "text-content-muted"}`}>
                {due.label}
              </Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

/* ─── Add column modal ─── */

function AddColumnModal({
  visible, nextPosition, onClose, onSubmit, isPending,
}: {
  visible: boolean; nextPosition: number;
  onClose: () => void; onSubmit: (name: string) => void; isPending: boolean;
}) {
  const [name, setName] = useState("");

  const presets = ["Por hacer", "En progreso", "En revisión", "Hecho", "Archivado"];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 justify-end">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View className="bg-dark-surface border-t border-dark-border rounded-t-3xl px-5 pt-4 pb-10">
            <View className="w-10 h-1 bg-dark-border rounded-full self-center mb-4" />
            <Text className="text-content-primary font-bold text-base mb-4">Nueva columna</Text>

            {/* Presets */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              <View className="flex-row gap-2">
                {presets.map((p) => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setName(p)}
                    className={`px-3 py-1.5 rounded-xl border ${name === p ? "bg-brand border-brand" : "bg-dark-raised border-dark-border"}`}
                  >
                    <Text className={`text-xs font-medium ${name === p ? "text-white" : "text-content-secondary"}`}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <TextInput
              className="bg-dark-raised border border-dark-border rounded-xl px-4 py-3 text-content-primary text-sm mb-4"
              placeholder="O escribe el nombre de la columna..."
              placeholderTextColor="#4A4A5C"
              value={name}
              onChangeText={setName}
              autoFocus
              maxLength={50}
            />
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={onClose} className="flex-1 bg-dark-raised border border-dark-border rounded-2xl py-3.5 items-center">
                <Text className="text-content-secondary font-semibold">Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { if (name.trim()) { onSubmit(name.trim()); setName(""); } }}
                disabled={!name.trim() || isPending}
                className={`flex-1 rounded-2xl py-3.5 items-center ${!name.trim() || isPending ? "bg-brand/40" : "bg-brand"}`}
              >
                {isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-white font-semibold">Crear</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/* ─── Create card modal ─── */

function CreateCardModal({
  visible, columnId, onClose, onSubmit, isPending,
}: {
  visible: boolean; columnId: string;
  onClose: () => void; onSubmit: (p: CreateCardPayload) => void; isPending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<CardPriority>("MEDIUM");
  const [dueDate, setDueDate] = useState("");

  function handleSubmit() {
    if (!title.trim()) return;
    onSubmit({
      columnId,
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      dueDate: dueDate.trim() || undefined,
    });
    setTitle(""); setDescription(""); setPriority("MEDIUM"); setDueDate("");
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
              <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">
                Título <Text className="text-red-400">*</Text>
              </Text>
              <TextInput
                className="bg-dark-raised border border-dark-border rounded-xl px-4 py-3 text-content-primary text-sm mb-4"
                placeholder="¿Qué hay que hacer?"
                placeholderTextColor="#4A4A5C"
                value={title} onChangeText={setTitle} autoFocus maxLength={200}
              />
              <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">Descripción</Text>
              <TextInput
                className="bg-dark-raised border border-dark-border rounded-xl px-4 py-3 text-content-primary text-sm mb-4"
                placeholder="Detalles adicionales (opcional)"
                placeholderTextColor="#4A4A5C"
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
              <TextInput
                className="bg-dark-raised border border-dark-border rounded-xl px-4 py-3 text-content-primary text-sm"
                placeholder="AAAA-MM-DD (opcional)"
                placeholderTextColor="#4A4A5C"
                value={dueDate} onChangeText={setDueDate}
                keyboardType="numbers-and-punctuation"
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/* ─── Edit card modal ─── */

function EditCardModal({
  visible, card, onClose, onSubmit, isPending,
}: {
  visible: boolean; card: KanbanCard;
  onClose: () => void; onSubmit: (p: UpdateCardPayload) => void; isPending: boolean;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [priority, setPriority] = useState<CardPriority>((card.priority as CardPriority) ?? "MEDIUM");
  const [dueDate, setDueDate] = useState(card.dueDate ? card.dueDate.substring(0, 10) : "");

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
                onPress={() => onSubmit({ title: title.trim(), description: description.trim() || undefined, priority, dueDate: dueDate || undefined })}
                disabled={!title.trim() || isPending}
                className={`px-4 py-1.5 rounded-xl ${!title.trim() || isPending ? "bg-brand/40" : "bg-brand"}`}>
                {isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-white font-semibold text-sm">Guardar</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
              <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">Título</Text>
              <TextInput
                className="bg-dark-raised border border-dark-border rounded-xl px-4 py-3 text-content-primary text-sm mb-4"
                value={title} onChangeText={setTitle} maxLength={200}
              />
              <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">Descripción</Text>
              <TextInput
                className="bg-dark-raised border border-dark-border rounded-xl px-4 py-3 text-content-primary text-sm mb-4"
                value={description} onChangeText={setDescription}
                multiline numberOfLines={3} textAlignVertical="top" style={{ minHeight: 72 }}
              />
              <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">Prioridad</Text>
              <View className="flex-row gap-2 mb-4">
                {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as CardPriority[]).map((p) => {
                  const s = PRIORITY_STYLE[p];
                  const active = priority === p;
                  return (
                    <TouchableOpacity key={p} onPress={() => setPriority(p)}
                      className={`flex-1 py-2 rounded-xl border items-center ${active ? s.badge : "bg-dark-raised border-dark-border"}`}>
                      <Text className={`text-xs font-bold ${active ? s.text : "text-content-muted"}`}>{PRIORITY_LABEL[p]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">Fecha límite</Text>
              <TextInput
                className="bg-dark-raised border border-dark-border rounded-xl px-4 py-3 text-content-primary text-sm"
                placeholder="AAAA-MM-DD"
                placeholderTextColor="#4A4A5C"
                value={dueDate} onChangeText={setDueDate}
                keyboardType="numbers-and-punctuation"
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
  visible, card, board, onClose, onEdit, onMove, onDelete, onToggleItem, onAddItem,
}: {
  visible: boolean;
  card: KanbanCard;
  board: Board;
  onClose: () => void;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
  onToggleItem: (itemId: string) => void;
  onAddItem: (text: string) => void;
}) {
  const [newItemText, setNewItemText] = useState("");
  const due = formatDue(card.dueDate);
  const p = (card.priority as CardPriority) ?? "LOW";
  const pStyle = PRIORITY_STYLE[p];
  const checklistDone = card.checklist.filter((i) => i.completed).length;
  const column = board.columns.find((c) => c.id === card.columnId);

  function submitItem() {
    if (!newItemText.trim()) return;
    onAddItem(newItemText.trim());
    setNewItemText("");
    Haptics.selectionAsync();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 justify-end">
        <View className="bg-dark-surface border-t border-dark-border rounded-t-3xl" style={{ maxHeight: "90%" }}>
          <View className="w-10 h-1 bg-dark-border rounded-full self-center mt-3" />

          {/* Header */}
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-border">
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#8888A0" /></TouchableOpacity>
            <Text className="text-content-primary font-bold" numberOfLines={1} style={{ maxWidth: "60%" }}>
              {card.title}
            </Text>
            <View className="flex-row gap-2">
              <TouchableOpacity onPress={onEdit}>
                <Ionicons name="pencil-outline" size={18} color="#8888A0" />
              </TouchableOpacity>
              <TouchableOpacity onPress={onDelete}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            {/* Meta row */}
            <View className="flex-row flex-wrap gap-2 mb-4">
              {/* Priority */}
              <View className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full border ${pStyle.badge}`}>
                <View className={`w-1.5 h-1.5 rounded-full ${pStyle.dot}`} />
                <Text className={`text-xs font-semibold ${pStyle.text}`}>{PRIORITY_LABEL[p]}</Text>
              </View>
              {/* Column */}
              {column && (
                <TouchableOpacity onPress={onMove}
                  className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-brand/10 border border-brand/20">
                  <Text className="text-xs text-brand-light">{column.name}</Text>
                  <Ionicons name="swap-horizontal-outline" size={10} color="#A78BFA" />
                </TouchableOpacity>
              )}
              {/* Due date */}
              {due.label && (
                <View className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full border ${
                  due.overdue ? "bg-red-500/15 border-red-500/30" : due.soon ? "bg-orange-500/15 border-orange-500/30" : "bg-dark-raised border-dark-border"
                }`}>
                  <Ionicons name="calendar-outline" size={10} color={due.overdue ? "#EF4444" : due.soon ? "#F97316" : "#4A4A5C"} />
                  <Text className={`text-xs ${due.overdue ? "text-red-400 font-semibold" : due.soon ? "text-orange-400" : "text-content-muted"}`}>
                    {due.label}
                  </Text>
                </View>
              )}
            </View>

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

            {/* Progress bar */}
            {card.checklist.length > 0 && (
              <View className="bg-dark-raised rounded-full h-1.5 mb-3 overflow-hidden">
                <View
                  className="bg-emerald-400 h-full rounded-full"
                  style={{ width: `${(checklistDone / card.checklist.length) * 100}%` }}
                />
              </View>
            )}

            {[...card.checklist].sort((a, b) => a.position - b.position).map((item) => (
              <ChecklistRow key={item.id} item={item} onToggle={() => onToggleItem(item.id)} />
            ))}

            {/* Add checklist item */}
            <View className="flex-row items-center gap-2 mt-2 bg-dark-raised border border-dark-border rounded-xl px-3">
              <Ionicons name="add-circle-outline" size={16} color="#4A4A5C" />
              <TextInput
                className="flex-1 py-3 text-content-primary text-sm"
                placeholder="Añadir elemento..."
                placeholderTextColor="#4A4A5C"
                value={newItemText}
                onChangeText={setNewItemText}
                onSubmitEditing={submitItem}
                returnKeyType="done"
              />
              {newItemText.trim().length > 0 && (
                <TouchableOpacity onPress={submitItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#7C3AED" />
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ─── Checklist row ─── */

function ChecklistRow({ item, onToggle }: { item: ChecklistItem; onToggle: () => void }) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      className="flex-row items-start gap-3 py-2.5 border-b border-dark-border/40"
      activeOpacity={0.7}
    >
      <View className={`w-5 h-5 rounded-md border mt-0.5 items-center justify-center flex-shrink-0 ${
        item.completed ? "bg-emerald-500 border-emerald-500" : "border-dark-border bg-dark-raised"
      }`}>
        {item.completed && <Ionicons name="checkmark" size={12} color="#fff" />}
      </View>
      <Text className={`flex-1 text-sm leading-5 ${item.completed ? "text-content-muted line-through" : "text-content-primary"}`}>
        {item.text}
      </Text>
    </TouchableOpacity>
  );
}
