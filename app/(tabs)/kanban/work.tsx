import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Pressable,
  TextInput,
  ScrollView,
  RefreshControl,
  StatusBar,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useState, useMemo } from "react";
import { router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { getWorkItems, getClients, WorkItem } from "@/api/kanban.api";
import { aiAssist } from "@/api/ai.api";
import { useAppTheme } from "@/hooks/useAppTheme";

/* ─── Types ─── */

type KindFilter = "ALL" | "TODO" | "IN_PROGRESS" | "DONE";
type PriorityFilter = "ALL" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const KIND_LABEL: Record<KindFilter, string> = {
  ALL: "Todas",
  TODO: "Por hacer",
  IN_PROGRESS: "En curso",
  DONE: "Listas",
};

const PRIORITY_COLOR: Record<string, string> = {
  LOW: "#6B7280",
  MEDIUM: "#F59E0B",
  HIGH: "#F97316",
  CRITICAL: "#EF4444",
};

const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

/* ─── Due date helper ─── */

function dueFriendly(date?: string | null, columnKind?: string | null): {
  label: string;
  bg: string;
  text: string;
} | null {
  if (!date) return null;
  if (columnKind === "DONE" || columnKind === "HISTORY") return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(date + "T00:00:00"); due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diff < -1) return { label: `Hace ${Math.abs(diff)}d`, bg: "bg-red-500/15",    text: "text-red-400" };
  if (diff === -1) return { label: "Ayer",                   bg: "bg-red-500/15",    text: "text-red-400" };
  if (diff === 0)  return { label: "Hoy",                    bg: "bg-orange-500/15", text: "text-orange-400" };
  if (diff === 1)  return { label: "Mañana",                 bg: "bg-amber-500/15",  text: "text-amber-400" };
  if (diff < 7)   return { label: `En ${diff}d`,             bg: "bg-blue-500/10",   text: "text-blue-400" };
  return { label: new Date(date + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" }), bg: "bg-dark-raised", text: "text-content-muted" };
}

function isPendingOverdue(item: WorkItem): boolean {
  return item.overdue && item.columnKind !== "DONE" && item.columnKind !== "HISTORY";
}

/* ─── Markdown renderer (same as boardId.tsx) ─── */

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <Text key={i} className="text-content-primary font-semibold">{part.slice(2, -2)}</Text>
    ) : (
      <Text key={i}>{part}</Text>
    )
  );
}

function MarkdownText({ text }: { text: string }) {
  return (
    <View>
      {text.split("\n").map((line, i) => {
        if (line.startsWith("### "))
          return <Text key={i} className="text-content-primary font-bold text-sm mt-4 mb-1">{line.slice(4)}</Text>;
        if (line.startsWith("## "))
          return <Text key={i} className="text-brand-light font-bold text-base mt-5 mb-1.5">{line.slice(3)}</Text>;
        if (line.startsWith("# "))
          return <Text key={i} className="text-brand-light font-bold text-lg mt-5 mb-2">{line.slice(2)}</Text>;
        const num = line.match(/^(\d+)\.\s(.+)/);
        if (num)
          return (
            <View key={i} className="flex-row gap-2 mt-1.5 pl-1">
              <Text className="text-brand-light font-bold text-sm w-5 shrink-0">{num[1]}.</Text>
              <Text className="flex-1 text-content-secondary text-sm leading-5">{renderInline(num[2])}</Text>
            </View>
          );
        if (line.match(/^[-*]\s/))
          return (
            <View key={i} className="flex-row gap-2 mt-1.5 pl-1">
              <Text className="text-brand-light font-bold text-sm w-4 shrink-0">•</Text>
              <Text className="flex-1 text-content-secondary text-sm leading-5">{renderInline(line.slice(2))}</Text>
            </View>
          );
        if (!line.trim()) return <View key={i} className="h-3" />;
        if (line.startsWith("**") && line.endsWith("**") && line.length > 4)
          return <Text key={i} className="text-content-primary font-semibold text-sm mt-3">{line.slice(2, -2)}</Text>;
        return (
          <Text key={i} className="text-content-secondary text-sm leading-5">{renderInline(line)}</Text>
        );
      })}
    </View>
  );
}

/* ─── Main screen ─── */

export default function KanbanWorkScreen() {
  const { barStyle, statusBarBg, iconMuted, iconSecondary, placeholder } = useAppTheme();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");

  const { data: rawItems = [], isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["kanban", "work-items"],
    queryFn: () => getWorkItems(),
    staleTime: 30_000,
  });

  const { data: allClients = [] } = useQuery({
    queryKey: ["clients", "work"],
    queryFn: () => getClients(),
    staleTime: 3 * 60_000,
  });

  const clientMap = useMemo(() => {
    const m = new Map<string, string>();
    allClients.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [allClients]);

  const filtered = useMemo(() => {
    let items = rawItems;
    if (kindFilter !== "ALL")
      items = items.filter((i) => i.columnKind === kindFilter);
    if (priorityFilter !== "ALL")
      items = items.filter((i) => i.card.priority === priorityFilter);
    if (search.trim())
      items = items.filter(
        (i) =>
          i.card.title.toLowerCase().includes(search.toLowerCase()) ||
          i.boardName.toLowerCase().includes(search.toLowerCase())
      );
    // Sort: overdue first, then by priority weight, then by due date
    return [...items].sort((a, b) => {
      const aOverdue = isPendingOverdue(a);
      const bOverdue = isPendingOverdue(b);
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      const pw = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      const ap = a.card.priority ? (pw[a.card.priority as keyof typeof pw] ?? 0) : 0;
      const bp = b.card.priority ? (pw[b.card.priority as keyof typeof pw] ?? 0) : 0;
      if (ap !== bp) return bp - ap;
      if (a.card.dueDate && b.card.dueDate) return a.card.dueDate.localeCompare(b.card.dueDate);
      return 0;
    });
  }, [rawItems, kindFilter, priorityFilter, search]);

  const metrics = useMemo(() => ({
    total:      rawItems.length,
    todo:       rawItems.filter((i) => i.columnKind === "TODO").length,
    inProgress: rawItems.filter((i) => i.columnKind === "IN_PROGRESS").length,
    done:       rawItems.filter((i) => i.columnKind === "DONE").length,
    overdue:    rawItems.filter(isPendingOverdue).length,
  }), [rawItems]);

  // ── AI state ──
  const [aiItem, setAiItem]       = useState<WorkItem | null>(null);
  const [aiSheet, setAiSheet]     = useState(false);
  const [aiResult, setAiResult]   = useState("");
  const [aiCopied, setAiCopied]   = useState(false);

  const aiMutation = useMutation({
    mutationFn: (item: WorkItem) =>
      aiAssist({
        task: "GENERATE_CARD_PROMPT",
        context: {
          cardTitle:       item.card.title,
          cardDescription: item.card.description ?? undefined,
          cardChecklist:   (item.card.checklist ?? []).map((c) => c.text),
          cardPriority:    item.card.priority ? (PRIORITY_LABEL[item.card.priority] ?? item.card.priority) : undefined,
          boardName:       item.boardName,
          clientName:      item.card.clientId ? (clientMap.get(item.card.clientId) ?? undefined) : undefined,
        },
      }),
    onSuccess: (result) => {
      setAiResult(result);
      setAiSheet(true);
      setAiCopied(false);
    },
    onError: () => Alert.alert("Error", "No se pudo generar el prompt. Inténtalo de nuevo."),
  });

  async function handleAi(item: WorkItem) {
    setAiItem(item);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    aiMutation.mutate(item);
  }

  async function handleCopy() {
    await Clipboard.setStringAsync(aiResult);
    setAiCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setAiCopied(false), 2000);
  }

  function openBoard(item: WorkItem) {
    router.push({ pathname: "/(tabs)/kanban/[boardId]", params: { boardId: item.boardId } });
  }

  return (
    <View className="flex-1 bg-dark-bg">
      <StatusBar barStyle={barStyle} backgroundColor={statusBarBg} />

      {/* Header */}
      <View className="bg-dark-surface border-b border-dark-border px-4 pt-14 pb-3">
        <View className="flex-row items-center gap-3 mb-3">
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={22} color={iconSecondary} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-content-primary text-lg font-bold">Todas las tareas</Text>
            <Text className="text-content-muted text-xs">
              {filtered.length} tarjeta{filtered.length !== 1 ? "s" : ""} · {metrics.overdue > 0 ? `${metrics.overdue} vencidas` : "al día"}
            </Text>
          </View>
        </View>

        {/* Search */}
        <View className="flex-row items-center gap-2 bg-dark-raised border border-dark-border rounded-xl px-3 py-2">
          <Ionicons name="search-outline" size={15} color={iconMuted} />
          <TextInput
            className="flex-1 text-content-primary text-sm"
            placeholder="Buscar por título o tablero..."
            placeholderTextColor={placeholder}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color={iconMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Metrics row — tappable, aplican el filtro de kind */}
        {!isLoading && rawItems.length > 0 && (
          <View className="flex-row gap-2 mt-3">
            {([
              { label: "Total",     value: metrics.total,      color: "#A78BFA", kind: "ALL"         as KindFilter },
              { label: "Por hacer", value: metrics.todo,       color: "#F59E0B", kind: "TODO"        as KindFilter },
              { label: "En curso",  value: metrics.inProgress, color: "#60A5FA", kind: "IN_PROGRESS" as KindFilter },
              { label: "Listas",    value: metrics.done,       color: "#34D399", kind: "DONE"        as KindFilter },
            ] as const).map((m) => {
              const active = kindFilter === m.kind;
              return (
                <TouchableOpacity
                  key={m.label}
                  onPress={() => { setKindFilter(m.kind); Haptics.selectionAsync(); }}
                  activeOpacity={0.75}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 8,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: active ? m.color + "55" : "#2A2A3C",
                    backgroundColor: active ? m.color + "14" : "#1A1A28",
                  }}
                >
                  <Text style={{ color: m.color, fontWeight: "700", fontSize: 17, lineHeight: 22 }}>
                    {m.value}
                  </Text>
                  <Text style={{ color: "#6B7280", fontSize: 10, marginTop: 1 }} numberOfLines={1}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {metrics.overdue > 0 && (
              <TouchableOpacity
                onPress={() => { setKindFilter("ALL"); Haptics.selectionAsync(); }}
                activeOpacity={0.75}
                style={{
                  alignItems: "center",
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "#EF444455",
                  backgroundColor: "#EF444414",
                }}
              >
                <Text style={{ color: "#EF4444", fontWeight: "700", fontSize: 17, lineHeight: 22 }}>
                  {metrics.overdue}
                </Text>
                <Text style={{ color: "#EF4444", fontSize: 10, marginTop: 1 }} numberOfLines={1}>
                  Vencidas
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Priority filter chips */}
      <View className="bg-dark-bg border-b border-dark-border/50">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}
        >
          <TouchableOpacity
            onPress={() => { setPriorityFilter("ALL"); Haptics.selectionAsync(); }}
            className={`px-3 py-1.5 rounded-full border ${
              priorityFilter === "ALL"
                ? "bg-brand border-brand/60"
                : "bg-dark-raised border-dark-border"
            }`}
          >
            <Text className={`text-xs font-semibold ${priorityFilter === "ALL" ? "text-white" : "text-content-muted"}`}>
              Todas
            </Text>
          </TouchableOpacity>
          {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as PriorityFilter[]).map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => { setPriorityFilter(priorityFilter === p ? "ALL" : p); Haptics.selectionAsync(); }}
              className="px-3 py-1.5 rounded-full border flex-row items-center gap-1.5"
              style={
                priorityFilter === p
                  ? { backgroundColor: `${PRIORITY_COLOR[p]}20`, borderColor: `${PRIORITY_COLOR[p]}60` }
                  : { backgroundColor: "#1A1A28", borderColor: "#2A2A3C" }
              }
            >
              <View className="w-2 h-2 rounded-full" style={{ backgroundColor: PRIORITY_COLOR[p] }} />
              <Text
                className="text-xs font-semibold"
                style={{ color: priorityFilter === p ? PRIORITY_COLOR[p] : "#6B7280" }}
              >
                {PRIORITY_LABEL[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* List */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#7C3AED" size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="layers-outline" size={40} color={iconMuted} />
          <Text className="text-content-primary font-bold text-base mt-4 text-center">Sin resultados</Text>
          <Text className="text-content-muted text-sm mt-1.5 text-center leading-5">
            {rawItems.length === 0
              ? "No hay tarjetas en ningún tablero todavía."
              : "Prueba a cambiar los filtros o la búsqueda."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#7C3AED" />
          }
          renderItem={({ item }) => (
            <WorkCard
              item={item}
              clientName={item.card.clientId ? (clientMap.get(item.card.clientId) ?? null) : null}
              onPress={() => openBoard(item)}
              onAi={() => handleAi(item)}
              aiLoading={aiMutation.isPending && aiItem?.id === item.id}
            />
          )}
        />
      )}

      {/* AI Result Sheet */}
      <Modal visible={aiSheet} animationType="slide" transparent onRequestClose={() => setAiSheet(false)}>
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={() => setAiSheet(false)}>
          <View
            className="bg-dark-surface border-t border-dark-border rounded-t-3xl"
            style={{ maxHeight: "88%" }}
            onStartShouldSetResponder={() => true}
          >
            {/* Handle */}
            <View className="items-center pt-3 pb-1">
              <View className="w-10 h-1 bg-dark-border rounded-full" />
            </View>
            {/* Header */}
            <View className="flex-row items-center justify-between px-5 py-3 border-b border-dark-border">
              <View className="flex-row items-center gap-2 flex-1 mr-3">
                <Ionicons name="sparkles" size={15} color="#A78BFA" />
                <Text className="text-content-primary font-bold text-base" numberOfLines={1}>
                  {aiItem?.card.title ?? "Prompt generado"}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setAiSheet(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={iconSecondary} />
              </TouchableOpacity>
            </View>
            {/* Board badge */}
            {aiItem && (
              <View className="px-5 py-2 border-b border-dark-border/50">
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="albums-outline" size={11} color={iconMuted} />
                  <Text className="text-content-muted text-xs">{aiItem.boardName} · {aiItem.columnName}</Text>
                </View>
              </View>
            )}
            {/* Content */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 8 }} showsVerticalScrollIndicator indicatorStyle="white">
              {aiMutation.isPending ? (
                <View className="items-center justify-center py-16 gap-3">
                  <ActivityIndicator color="#7C3AED" />
                  <Text className="text-content-muted text-sm">Generando prompt…</Text>
                </View>
              ) : (
                <MarkdownText text={aiResult} />
              )}
            </ScrollView>
            {/* Actions */}
            <View className="border-t border-dark-border px-4 pt-3 pb-6 flex-row gap-3">
              <TouchableOpacity
                onPress={() => { if (aiItem) aiMutation.mutate(aiItem); Haptics.selectionAsync(); }}
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
                  aiCopied ? "bg-emerald-500/20 border border-emerald-500/40" : "bg-brand border border-brand/60"
                }`}
              >
                <Ionicons name={aiCopied ? "checkmark-circle" : "copy-outline"} size={15} color={aiCopied ? "#34D399" : "#fff"} />
                <Text className={`font-semibold text-sm ${aiCopied ? "text-emerald-400" : "text-white"}`}>
                  {aiCopied ? "¡Copiado!" : "Copiar"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ─── Work card ─── */

function WorkCard({
  item, clientName, onPress, onAi, aiLoading,
}: {
  item: WorkItem;
  clientName: string | null;
  onPress: () => void;
  onAi: () => void;
  aiLoading: boolean;
}) {
  const { iconMuted } = useAppTheme();
  const due = dueFriendly(item.card.dueDate, item.columnKind);
  const overdue = isPendingOverdue(item);
  const columnLabel =
    item.columnKind === "TODO" ? "Por hacer" :
    item.columnKind === "IN_PROGRESS" ? "En curso" :
    item.columnKind === "DONE" ? "Lista" :
    item.columnKind === "HISTORY" ? "Historial" :
    item.columnName;

  const kindDot =
    item.columnKind === "TODO"        ? "bg-amber-400" :
    item.columnKind === "IN_PROGRESS" ? "bg-blue-400"  :
    item.columnKind === "DONE"        ? "bg-green-400" :
    "bg-gray-400";

  const priorityColor = (item.card.priority ? PRIORITY_COLOR[item.card.priority] : null) ?? "#6B7280";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className={`bg-dark-surface rounded-2xl border p-3.5 ${
        overdue ? "border-red-500/40" : "border-dark-border"
      }`}
    >
      {/* Row 1: priority dot + board badge + column dot + AI button */}
      <View className="flex-row items-center gap-2 mb-2">
        <View className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: priorityColor }} />
        <View className="flex-row items-center gap-1 bg-dark-raised border border-dark-border rounded px-1.5 py-0.5">
          <Ionicons name="albums-outline" size={9} color={iconMuted} />
          <Text className="text-content-muted text-[10px]" numberOfLines={1}>{item.boardName}</Text>
        </View>
        <View className="flex-row items-center gap-1 ml-auto">
          <View className={`w-1.5 h-1.5 rounded-full ${kindDot}`} />
          <Text className="text-content-muted text-[10px]">{columnLabel}</Text>
        </View>
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation?.(); onAi(); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="ml-1 p-1 rounded-lg bg-brand/10 border border-brand/25"
        >
          {aiLoading ? (
            <ActivityIndicator size={12} color="#A78BFA" />
          ) : (
            <Ionicons name="sparkles-outline" size={13} color="#A78BFA" />
          )}
        </TouchableOpacity>
      </View>

      {/* Title */}
      <Text className="text-content-primary font-semibold text-sm leading-5 mb-1.5" numberOfLines={2}>
        {item.card.title}
      </Text>

      {/* Description */}
      {item.card.description ? (
        <Text className="text-content-muted text-xs leading-4 mb-2" numberOfLines={2}>
          {item.card.description}
        </Text>
      ) : null}

      {/* Client */}
      {clientName ? (
        <View className="flex-row items-center gap-1 mb-2">
          <Ionicons name="business-outline" size={11} color="#A78BFA" />
          <Text className="text-brand-light text-[11px] font-medium" numberOfLines={1}>{clientName}</Text>
        </View>
      ) : null}

      {/* Footer chips */}
      <View className="flex-row items-center flex-wrap gap-1.5 mt-0.5">
        {/* Priority */}
        <View
          className="flex-row items-center gap-1 px-2 py-0.5 rounded-full border"
          style={{ backgroundColor: `${priorityColor}18`, borderColor: `${priorityColor}40` }}
        >
          <Text className="text-[10px] font-semibold" style={{ color: priorityColor }}>
            {item.card.priority ? (PRIORITY_LABEL[item.card.priority] ?? item.card.priority) : "—"}
          </Text>
        </View>

        {/* Due date */}
        {due && (
          <View className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full border ${due.bg}`} style={{ borderColor: "transparent" }}>
            <Ionicons name="calendar-outline" size={9} color={due.text.includes("red") ? "#EF4444" : due.text.includes("orange") ? "#F97316" : due.text.includes("amber") ? "#F59E0B" : "#60A5FA"} />
            <Text className={`text-[10px] font-semibold ${due.text}`}>{due.label}</Text>
          </View>
        )}

        {/* Checklist */}
        {item.checklistProgress ? (
          <View className="flex-row items-center gap-1 px-2 py-0.5 rounded-full bg-dark-raised border border-dark-border">
            <Ionicons name="checkmark-circle-outline" size={9} color={iconMuted} />
            <Text className="text-content-muted text-[10px]">{item.checklistProgress}</Text>
          </View>
        ) : null}

        {/* Labels */}
        {(item.card.labels ?? []).slice(0, 2).map((lbl) => (
          <View key={lbl} className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20">
            <Text className="text-blue-400 text-[10px]">{lbl}</Text>
          </View>
        ))}

        {/* Assignees */}
        {item.assigneeNames.length > 0 && (
          <View className="flex-row items-center gap-1 ml-auto">
            {item.assigneeNames.slice(0, 3).map((name, idx) => (
              <View
                key={idx}
                className="w-5 h-5 rounded-full bg-brand border-2 border-dark-surface items-center justify-center"
                style={{ marginLeft: idx > 0 ? -6 : 0 }}
              >
                <Text className="text-white text-[8px] font-bold">{name[0]?.toUpperCase() ?? "?"}</Text>
              </View>
            ))}
            {item.assigneeNames.length > 3 && (
              <Text className="text-content-muted text-[10px] ml-0.5">+{item.assigneeNames.length - 3}</Text>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}
