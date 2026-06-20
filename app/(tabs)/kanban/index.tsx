import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { getBoards, createBoard, deleteBoard } from "@/api/kanban.api";
import { Board, BoardVisibility, CreateBoardPayload } from "@/types/kanban";
import { timeAgo } from "@/utils/timeAgo";
import { useAppTheme } from "@/hooks/useAppTheme";

const BOARD_KEYS = {
  all: ["boards"] as const,
  list: () => [...BOARD_KEYS.all, "list"] as const,
};

export default function KanbanBoardListScreen() {
  const qc = useQueryClient();
  const { barStyle, statusBarBg } = useAppTheme();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: BOARD_KEYS.list(),
    queryFn: () => getBoards(),
    staleTime: 0,
    retry: false,
  });

  const boards = data?.content ?? [];

  const removeMutation = useMutation({
    mutationFn: deleteBoard,
    onSuccess: () => qc.invalidateQueries({ queryKey: BOARD_KEYS.all }),
  });

  function confirmDelete(board: Board) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      `Eliminar "${board.name}"`,
      "Se eliminará el tablero y todas sus columnas y tarjetas. Esta acción no se puede deshacer.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => removeMutation.mutate(board.id),
        },
      ]
    );
  }

  return (
    <View className="flex-1 bg-dark-bg">
      <StatusBar barStyle={barStyle} backgroundColor={statusBarBg} />

      {/* Header */}
      <View className="bg-dark-surface border-b border-dark-border px-4 pt-16 pb-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-content-primary text-xl font-bold">Kanban</Text>
            {boards.length > 0 && (
              <Text className="text-content-muted text-xs mt-0.5">
                {boards.length} tablero{boards.length !== 1 ? "s" : ""}
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={() => { setShowCreate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
            className="flex-row items-center gap-1.5 bg-brand px-3 py-2 rounded-xl"
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text className="text-white text-sm font-semibold">Nuevo tablero</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#7C3AED" size="large" />
        </View>
      ) : boards.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-16 h-16 rounded-2xl bg-brand/15 border border-brand/20 items-center justify-center mb-4">
            <Ionicons name="albums-outline" size={32} color="#7C3AED" />
          </View>
          <Text className="text-content-primary text-base font-bold text-center">
            Sin tableros Kanban
          </Text>
          <Text className="text-content-muted text-sm text-center mt-2 leading-5">
            Crea tu primer tablero para organizar tareas en columnas.
          </Text>
          <TouchableOpacity
            onPress={() => setShowCreate(true)}
            className="mt-5 bg-brand px-6 py-3 rounded-2xl flex-row items-center gap-2"
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text className="text-white font-semibold">Crear tablero</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={boards}
          keyExtractor={(b) => b.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#7C3AED" />
          }
          contentContainerStyle={{ padding: 12, gap: 10 }}
          renderItem={({ item: board }) => (
            <BoardCard
              board={board}
              onPress={() => router.push({ pathname: "/(tabs)/kanban/[boardId]", params: { boardId: board.id } })}
              onDelete={() => confirmDelete(board)}
            />
          )}
        />
      )}

      <CreateBoardModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false);
          qc.invalidateQueries({ queryKey: BOARD_KEYS.all });
        }}
      />
    </View>
  );
}

/* ─── Board card ─── */

function BoardCard({ board, onPress, onDelete }: {
  board: Board;
  onPress: () => void;
  onDelete: () => void;
}) {
  const { iconMuted } = useAppTheme();
  const totalCards = board.columns.reduce((s, c) => s + c.cards.length, 0);
  const isPrivate = board.visibility === "PRIVATE";

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onDelete}
      delayLongPress={600}
      activeOpacity={0.75}
      className="bg-dark-surface border border-dark-border rounded-2xl p-4"
    >
      {/* Row 1: icon + name + visibility */}
      <View className="flex-row items-start gap-3">
        <View className="w-10 h-10 rounded-xl bg-brand/15 border border-brand/20 items-center justify-center">
          <Ionicons name="albums" size={18} color="#7C3AED" />
        </View>
        <View className="flex-1">
          <Text className="text-content-primary font-bold text-base" numberOfLines={1}>
            {board.name}
          </Text>
          {board.description && (
            <Text className="text-content-muted text-xs mt-0.5 leading-4" numberOfLines={2}>
              {board.description}
            </Text>
          )}
        </View>
        <View className={`px-2 py-0.5 rounded-full border flex-row items-center gap-1 ${
          isPrivate ? "bg-dark-raised border-dark-border" : "bg-brand/10 border-brand/20"
        }`}>
          <Ionicons
            name={isPrivate ? "lock-closed" : "people"}
            size={9}
            color={isPrivate ? iconMuted : "#A78BFA"}
          />
          <Text className={`text-[10px] font-semibold ${isPrivate ? "text-content-muted" : "text-brand-light"}`}>
            {isPrivate ? "Privado" : "Equipo"}
          </Text>
        </View>
      </View>

      {/* Columns preview */}
      {board.columns.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3"
          contentContainerStyle={{ gap: 6 }}
        >
          {board.columns.map((col) => (
            <View
              key={col.id}
              className="bg-dark-raised border border-dark-border rounded-lg px-2.5 py-1.5 flex-row items-center gap-1.5"
            >
              <Text className="text-content-secondary text-xs font-medium">{col.name}</Text>
              {col.cards.length > 0 && (
                <View className="bg-brand/20 rounded-full w-4 h-4 items-center justify-center">
                  <Text className="text-brand-light text-[9px] font-bold">{col.cards.length}</Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Footer */}
      <View className="flex-row items-center mt-3 pt-3 border-t border-dark-border/50 gap-3">
        <View className="flex-row items-center gap-1">
          <Ionicons name="square-outline" size={12} color={iconMuted} />
          <Text className="text-content-muted text-xs">{board.columns.length} columnas</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Ionicons name="card-outline" size={12} color={iconMuted} />
          <Text className="text-content-muted text-xs">{totalCards} tarjetas</Text>
        </View>
        <Text className="text-content-muted text-xs ml-auto">{timeAgo(board.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );
}

/* ─── Create board modal ─── */

function CreateBoardModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { placeholder, iconMuted } = useAppTheme();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<BoardVisibility>("TEAM");
  const [nameError, setNameError] = useState(false);

  const mutation = useMutation({
    mutationFn: (payload: CreateBoardPayload) => createBoard(payload),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setName("");
      setDescription("");
      setVisibility("TEAM");
      onCreated();
    },
    onError: () => Alert.alert("Error", "No se pudo crear el tablero."),
  });

  function handleSubmit() {
    if (!name.trim()) { setNameError(true); return; }
    mutation.mutate({ name: name.trim(), description: description.trim() || undefined, visibility });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 justify-end">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View className="bg-dark-surface border-t border-dark-border rounded-t-3xl">
            <View className="w-10 h-1 bg-dark-border rounded-full self-center mt-3" />

            {/* Header */}
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-border">
              <TouchableOpacity onPress={onClose}>
                <Text className="text-content-muted text-sm">Cancelar</Text>
              </TouchableOpacity>
              <Text className="text-content-primary font-bold">Nuevo tablero</Text>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={mutation.isPending}
                className={`px-4 py-1.5 rounded-xl ${mutation.isPending ? "bg-brand/40" : "bg-brand"}`}
              >
                {mutation.isPending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text className="text-white font-semibold text-sm">Crear</Text>
                }
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            >
              {/* Nombre */}
              <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">
                Nombre <Text className="text-red-400">*</Text>
              </Text>
              <TextInput
                className={`bg-dark-raised border rounded-xl px-4 py-3 text-content-primary text-sm mb-4 ${nameError ? "border-red-500/60" : "border-dark-border"}`}
                placeholder="Ej. Soporte técnico, Proyectos Q3..."
                placeholderTextColor={placeholder}
                value={name}
                onChangeText={(v) => { setName(v); if (v.trim()) setNameError(false); }}
                maxLength={100}
              />

              {/* Descripción */}
              <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">
                Descripción
              </Text>
              <TextInput
                className="bg-dark-raised border border-dark-border rounded-xl px-4 py-3 text-content-primary text-sm mb-5"
                placeholder="¿Para qué sirve este tablero? (opcional)"
                placeholderTextColor={placeholder}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                style={{ minHeight: 72 }}
                maxLength={300}
              />

              {/* Visibilidad */}
              <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">
                Visibilidad
              </Text>
              <View className="flex-row gap-3">
                {(["TEAM", "PRIVATE"] as BoardVisibility[]).map((v) => (
                  <TouchableOpacity
                    key={v}
                    onPress={() => { setVisibility(v); Haptics.selectionAsync(); }}
                    className={`flex-1 rounded-xl border p-3 items-center gap-1.5 ${
                      visibility === v
                        ? "bg-brand/15 border-brand/40"
                        : "bg-dark-raised border-dark-border"
                    }`}
                  >
                    <Ionicons
                      name={v === "PRIVATE" ? "lock-closed" : "people"}
                      size={18}
                      color={visibility === v ? "#A78BFA" : iconMuted}
                    />
                    <Text className={`text-sm font-semibold ${visibility === v ? "text-brand-light" : "text-content-muted"}`}>
                      {v === "PRIVATE" ? "Privado" : "Equipo"}
                    </Text>
                    <Text className={`text-[10px] text-center leading-3 ${visibility === v ? "text-brand-light/70" : "text-content-muted"}`}>
                      {v === "PRIVATE" ? "Solo tú" : "Todo el equipo"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
