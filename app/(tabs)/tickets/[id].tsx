import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  StatusBar,
  ScrollView,
  RefreshControl,
  Modal,
  Pressable,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useState, useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import {
  useTicket,
  useTicketComments,
  useAddComment,
  useUpdateTicketStatus,
} from "@/queries/tickets.queries";
import { useTemplates } from "@/queries/templates.queries";
import {
  useTicketAttachments,
  useUploadAttachment,
  useDeleteAttachment,
} from "@/queries/attachments.queries";
import {
  useTimeSummary,
  useStartTimer,
  useStopTimer,
  useLogTime,
  useActiveEntry,
} from "@/queries/time.queries";
import { TicketComment, TicketStatus } from "@/types/ticket";
import { ResponseTemplate } from "@/types/templates";
import { TicketAttachment } from "@/types/time";
import { timeAgo } from "@/utils/timeAgo";
import { apiClient } from "@/api/client";
import { useAppTheme } from "@/hooks/useAppTheme";

const STATUS_OPTIONS: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"];

const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En progreso",
  WAITING: "En espera",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
};

const STATUS_BADGE: Record<TicketStatus, { bg: string; text: string }> = {
  OPEN:        { bg: "bg-blue-500/20",    text: "text-blue-400" },
  IN_PROGRESS: { bg: "bg-amber-500/20",   text: "text-amber-400" },
  WAITING:     { bg: "bg-yellow-500/20",  text: "text-yellow-300" },
  RESOLVED:    { bg: "bg-emerald-500/20", text: "text-emerald-400" },
  CLOSED:      { bg: "bg-dark-raised",    text: "text-content-muted" },
};

const PRIORITY_BADGE: Record<string, { bg: string; text: string }> = {
  CRITICAL: { bg: "bg-red-500/20",    text: "text-red-400" },
  HIGH:     { bg: "bg-orange-500/20", text: "text-orange-400" },
  MEDIUM:   { bg: "bg-amber-500/20",  text: "text-amber-400" },
  LOW:      { bg: "bg-dark-raised",   text: "text-content-muted" },
};

const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: "CRÍTICO", HIGH: "ALTO", MEDIUM: "MEDIO", LOW: "BAJO",
};

function slaLabel(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Vencido";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d restantes`;
  if (h > 0) return `${h}h ${m}m restantes`;
  return `${m}m restantes`;
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default function TicketDetailScreen() {
  const { barStyle, statusBarBg, iconMuted, iconSecondary, iconEmpty, placeholder } = useAppTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [reply, setReply] = useState("");
  const [tab, setTab] = useState<"conversation" | "details">("conversation");
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [logTimeOpen, setLogTimeOpen] = useState(false);
  const [logMinutes, setLogMinutes] = useState("");
  const [logNote, setLogNote] = useState("");
  const flatRef = useRef<FlatList>(null);

  const { data: ticket, isLoading: loadingTicket, refetch: refetchTicket, isRefetching: refetchingTicket } = useTicket(id);
  const { data: comments, isLoading: loadingComments, refetch: refetchComments, isRefetching: refetchingComments } = useTicketComments(id);
  const addComment = useAddComment(id);
  const updateStatus = useUpdateTicketStatus(id);

  const { data: templates } = useTemplates(templateSearch || undefined);
  const { data: attachments } = useTicketAttachments(id);
  const uploadAttachment = useUploadAttachment(id);
  const deleteAttachment = useDeleteAttachment(id);
  const { data: timeSummary } = useTimeSummary("TICKET", id);
  const { data: activeEntry } = useActiveEntry();
  const startTimer = useStartTimer();
  const stopTimer = useStopTimer();
  const logTime = useLogTime();

  const isThisTicketActive = activeEntry?.entityType === "TICKET" && activeEntry?.entityId === id;
  const isRefreshing = refetchingTicket || refetchingComments;

  function handleRefresh() {
    refetchTicket();
    refetchComments();
  }

  const { data: client } = useQuery({
    queryKey: ["client", ticket?.clientId],
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/clients/${ticket!.clientId}`);
      return res.data as {
        name: string;
        primaryEmail?: string;
        primaryContactName?: string;
        primaryPhone?: string;
        status?: string;
      };
    },
    enabled: !!ticket?.clientId,
    staleTime: 300_000,
  });

  function handleSend() {
    if (!reply.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addComment.mutate(reply.trim(), {
      onSuccess: () => {
        setReply("");
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 200);
      },
      onError: () => Alert.alert("Error", "No se pudo enviar la respuesta"),
    });
  }

  function handleChangeStatus() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const options = STATUS_OPTIONS.map((s) => STATUS_LABELS[s]);
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...options, "Cancelar"],
          cancelButtonIndex: options.length,
          title: "Cambiar estado del ticket",
        },
        (idx) => {
          if (idx < STATUS_OPTIONS.length) updateStatus.mutate(STATUS_OPTIONS[idx]);
        }
      );
    } else {
      Alert.alert("Cambiar estado", undefined, [
        ...STATUS_OPTIONS.map((s) => ({
          text: STATUS_LABELS[s],
          onPress: () => updateStatus.mutate(s),
        })),
        { text: "Cancelar", style: "cancel" as const },
      ]);
    }
  }

  function handlePickTemplate(t: ResponseTemplate) {
    Haptics.selectionAsync();
    setReply(t.body);
    setTemplatePickerOpen(false);
    setTemplateSearch("");
    setTab("conversation");
  }

  async function handlePickAttachment() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const name = asset.fileName ?? `attachment-${Date.now()}.jpg`;
    const type = asset.mimeType ?? "image/jpeg";
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    uploadAttachment.mutate(
      { uri: asset.uri, name, type },
      { onError: () => Alert.alert("Error", "No se pudo subir el archivo") },
    );
  }

  function handleDeleteAttachment(a: TicketAttachment) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Eliminar adjunto", `¿Eliminar "${a.fileName}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: () =>
          deleteAttachment.mutate(a.id, {
            onError: () => Alert.alert("Error", "No se pudo eliminar el adjunto"),
          }),
      },
    ]);
  }

  function handleToggleTimer() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isThisTicketActive && activeEntry) {
      stopTimer.mutate(activeEntry.id, {
        onError: () => Alert.alert("Error", "No se pudo detener el timer"),
      });
    } else {
      startTimer.mutate(
        { entityType: "TICKET", entityId: id },
        { onError: () => Alert.alert("Error", "No se pudo iniciar el timer") },
      );
    }
  }

  function handleLogTime() {
    const mins = parseInt(logMinutes, 10);
    if (!mins || mins <= 0) {
      Alert.alert("Error", "Ingresa un número de minutos válido");
      return;
    }
    logTime.mutate(
      { entityType: "TICKET", entityId: id, minutes: mins, note: logNote.trim() || undefined },
      {
        onSuccess: () => {
          setLogTimeOpen(false);
          setLogMinutes("");
          setLogNote("");
        },
        onError: () => Alert.alert("Error", "No se pudo registrar el tiempo"),
      },
    );
  }

  if (loadingTicket) {
    return (
      <View className="flex-1 bg-dark-bg items-center justify-center">
        <StatusBar barStyle={barStyle} backgroundColor={statusBarBg} />
        <ActivityIndicator color="#7C3AED" size="large" />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View className="flex-1 bg-dark-bg items-center justify-center">
        <StatusBar barStyle={barStyle} backgroundColor={statusBarBg} />
        <Ionicons name="alert-circle-outline" size={48} color={iconEmpty} />
        <Text className="text-content-secondary mt-3">Ticket no encontrado</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-brand-light text-sm">Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusStyle = STATUS_BADGE[ticket.status];
  const priorityStyle = PRIORITY_BADGE[ticket.priority];
  const slaBreached = ticket.slaBreached;
  const slaAtRisk =
    !slaBreached && ticket.slaDueAt
      ? new Date(ticket.slaDueAt).getTime() - Date.now() < 4 * 3_600_000
      : false;

  const filteredTemplates = (templates ?? []).filter(
    (t) =>
      !templateSearch ||
      t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.body.toLowerCase().includes(templateSearch.toLowerCase()) ||
      (t.shortcut ?? "").toLowerCase().includes(templateSearch.toLowerCase()),
  );

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-dark-bg"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle={barStyle} backgroundColor={statusBarBg} />

      {/* ── Custom header ── */}
      <View className="bg-dark-surface border-b border-dark-border pt-14 pb-0">

        {/* Nav row: back + ticket ID + status pill */}
        <View className="flex-row items-center px-4 pb-3">
          <TouchableOpacity
            onPress={() => router.back()}
            className="flex-row items-center gap-1 mr-3"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={20} color={iconSecondary} />
            <Text className="text-content-secondary text-sm">Tickets</Text>
          </TouchableOpacity>
          <Text className="text-content-muted font-mono text-xs flex-1">#{id.slice(0, 8).toUpperCase()}</Text>
          <TouchableOpacity
            onPress={handleChangeStatus}
            className={`flex-row items-center gap-1 px-3 py-1.5 rounded-full ${statusStyle.bg}`}
          >
            <Text className={`text-xs font-bold ${statusStyle.text}`}>
              {STATUS_LABELS[ticket.status]}
            </Text>
            {updateStatus.isPending
              ? <ActivityIndicator size={10} color={iconSecondary} />
              : <Ionicons name="chevron-down" size={11} color={iconSecondary} />}
          </TouchableOpacity>
        </View>

        {/* Title */}
        <View className="px-4 pb-2.5">
          <Text className="text-content-primary font-bold text-base leading-6">
            {ticket.title}
          </Text>
        </View>

        {/* Badges */}
        <View className="flex-row flex-wrap gap-2 px-4 pb-3 items-center">
          <View className={`px-2.5 py-1 rounded-full ${priorityStyle.bg}`}>
            <Text className={`text-[10px] font-bold ${priorityStyle.text}`}>
              {PRIORITY_LABELS[ticket.priority]}
            </Text>
          </View>

          <View className="bg-dark-raised border border-dark-border px-2.5 py-1 rounded-full flex-row items-center gap-1">
            <Ionicons name="git-branch-outline" size={10} color={iconMuted} />
            <Text className="text-content-muted text-[10px] font-semibold">{ticket.source}</Text>
          </View>

          {ticket.labels.map((l) => (
            <View key={l} className="bg-brand/10 border border-brand/20 px-2.5 py-1 rounded-full">
              <Text className="text-[10px] text-brand-light">{l}</Text>
            </View>
          ))}

          {slaBreached ? (
            <View className="bg-red-500/15 border border-red-500/30 px-2.5 py-1 rounded-full flex-row items-center gap-1">
              <Ionicons name="warning" size={10} color="#EF4444" />
              <Text className="text-[10px] font-bold text-red-400">SLA vencido</Text>
            </View>
          ) : slaAtRisk && ticket.slaDueAt ? (
            <View className="bg-orange-500/15 border border-orange-500/30 px-2.5 py-1 rounded-full flex-row items-center gap-1">
              <Ionicons name="timer-outline" size={10} color="#F97316" />
              <Text className="text-[10px] font-bold text-orange-400">{slaLabel(ticket.slaDueAt)}</Text>
            </View>
          ) : ticket.slaDueAt ? (
            <View className="bg-dark-raised border border-dark-border px-2.5 py-1 rounded-full flex-row items-center gap-1">
              <Ionicons name="timer-outline" size={10} color={iconMuted} />
              <Text className="text-[10px] text-content-muted">{slaLabel(ticket.slaDueAt)}</Text>
            </View>
          ) : null}
        </View>

        {/* Client row */}
        {client && (
          <View className="flex-row items-center gap-2 px-4 pb-3">
            <View className="w-6 h-6 rounded-full bg-brand/20 items-center justify-center">
              <Ionicons name="business-outline" size={12} color="#7C3AED" />
            </View>
            <Text className="text-content-secondary text-xs font-medium">{client.name}</Text>
            {client.primaryContactName && (
              <>
                <Text className="text-content-muted text-xs">·</Text>
                <Text className="text-content-muted text-xs">{client.primaryContactName}</Text>
              </>
            )}
          </View>
        )}

        {/* Tabs */}
        <View className="flex-row border-t border-dark-border">
          {(["conversation", "details"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              className={`flex-1 py-3 items-center border-b-2 ${
                tab === t ? "border-brand" : "border-transparent"
              }`}
            >
              <View className="flex-row items-center gap-1.5">
                <Ionicons
                  name={t === "conversation" ? "chatbubbles-outline" : "information-circle-outline"}
                  size={14}
                  color={tab === t ? "#7C3AED" : iconMuted}
                />
                <Text className={`text-xs font-semibold ${tab === t ? "text-brand-light" : "text-content-muted"}`}>
                  {t === "conversation"
                    ? `Conversación${(comments?.length ?? 0) > 0 ? ` (${comments!.length})` : ""}`
                    : "Detalles"}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Body ── */}
      {tab === "conversation" ? (
        <>
          {loadingComments ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#7C3AED" />
            </View>
          ) : (
            <FlatList
              ref={flatRef}
              data={comments ?? []}
              keyExtractor={(c) => c.id}
              renderItem={({ item }) => <MessageBubble comment={item} />}
              contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  tintColor="#7C3AED"
                />
              }
              ListEmptyComponent={
                <View className="items-center py-16">
                  <Ionicons name="chatbubble-outline" size={40} color={iconEmpty} />
                  <Text className="text-content-muted text-sm mt-3">Sin mensajes todavía</Text>
                  <Text className="text-content-muted text-xs mt-1">
                    Escribe la primera respuesta abajo
                  </Text>
                </View>
              }
              onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
            />
          )}

          {/* Reply bar */}
          <View className="bg-dark-surface border-t border-dark-border px-3 pt-2 pb-3">
            {/* Action row */}
            <View className="flex-row items-center gap-2 mb-2">
              <TouchableOpacity
                onPress={() => setTemplatePickerOpen(true)}
                className="flex-row items-center gap-1 bg-dark-raised border border-dark-border rounded-full px-3 py-1.5"
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="flash-outline" size={12} color={iconSecondary} />
                <Text className="text-content-secondary text-[11px] font-medium">Plantillas</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handlePickAttachment}
                disabled={uploadAttachment.isPending}
                className="flex-row items-center gap-1 bg-dark-raised border border-dark-border rounded-full px-3 py-1.5"
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                {uploadAttachment.isPending ? (
                  <ActivityIndicator size={12} color={iconSecondary} />
                ) : (
                  <Ionicons name="attach-outline" size={12} color={iconSecondary} />
                )}
                <Text className="text-content-secondary text-[11px] font-medium">Adjuntar</Text>
              </TouchableOpacity>
            </View>
            {/* Input + send */}
            <View className="flex-row items-end gap-2">
              <TextInput
                className="flex-1 bg-dark-raised border border-dark-border rounded-2xl px-4 py-3 text-content-primary text-sm max-h-28"
                placeholder="Escribe una respuesta..."
                placeholderTextColor={placeholder}
                value={reply}
                onChangeText={setReply}
                multiline
              />
              <TouchableOpacity
                onPress={handleSend}
                disabled={!reply.trim() || addComment.isPending}
                className={`w-11 h-11 rounded-full items-center justify-center ${
                  reply.trim() ? "bg-brand" : "bg-dark-raised"
                }`}
              >
                {addComment.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="send" size={16} color={reply.trim() ? "#fff" : iconMuted} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#7C3AED"
            />
          }
        >
          {/* Description */}
          {ticket.description && (
            <DetailSection title="Descripción" icon="document-text-outline">
              <Text className="text-content-secondary text-sm leading-5">{ticket.description}</Text>
            </DetailSection>
          )}

          {/* Time tracker */}
          <DetailSection title="Tiempo" icon="time-outline">
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-content-muted text-[10px] font-semibold uppercase tracking-wider mb-0.5">
                  Registrado
                </Text>
                <Text className="text-content-primary font-bold text-lg">
                  {timeSummary ? formatMinutes(timeSummary.loggedMinutes) : "—"}
                </Text>
                {ticket.estimatedMinutes ? (
                  <Text className="text-content-muted text-xs mt-0.5">
                    de {formatMinutes(ticket.estimatedMinutes)} estimados
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={handleToggleTimer}
                disabled={startTimer.isPending || stopTimer.isPending || (!!activeEntry && !isThisTicketActive)}
                className={`flex-row items-center gap-2 px-4 py-2.5 rounded-full ${
                  isThisTicketActive
                    ? "bg-red-500/20 border border-red-500/30"
                    : "bg-emerald-500/20 border border-emerald-500/30"
                }`}
              >
                {startTimer.isPending || stopTimer.isPending ? (
                  <ActivityIndicator size={14} color={isThisTicketActive ? "#EF4444" : "#10B981"} />
                ) : (
                  <Ionicons
                    name={isThisTicketActive ? "stop-circle-outline" : "play-circle-outline"}
                    size={18}
                    color={isThisTicketActive ? "#EF4444" : "#10B981"}
                  />
                )}
                <Text
                  className={`text-sm font-semibold ${
                    isThisTicketActive ? "text-red-400" : "text-emerald-400"
                  }`}
                >
                  {isThisTicketActive ? "Detener" : "Iniciar"}
                </Text>
              </TouchableOpacity>
            </View>

            {activeEntry && !isThisTicketActive && (
              <View className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 mb-3 flex-row items-center gap-2">
                <Ionicons name="information-circle-outline" size={14} color="#F59E0B" />
                <Text className="text-amber-400 text-xs flex-1">
                  Timer activo en otro elemento
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={() => setLogTimeOpen(true)}
              className="flex-row items-center justify-center gap-1.5 py-2.5 border border-dark-border rounded-xl"
            >
              <Ionicons name="pencil-outline" size={13} color={iconSecondary} />
              <Text className="text-content-secondary text-xs font-medium">Registrar tiempo manualmente</Text>
            </TouchableOpacity>

            {timeSummary && timeSummary.entries.length > 0 && (
              <View className="mt-3 gap-1">
                <Text className="text-content-muted text-[10px] font-semibold uppercase tracking-wider mb-1">
                  Entradas ({timeSummary.entries.length})
                </Text>
                {timeSummary.entries.slice(0, 5).map((e) => (
                  <View key={e.id} className="flex-row items-center gap-2 py-1.5">
                    <View className={`w-2 h-2 rounded-full ${e.active ? "bg-emerald-400" : "bg-dark-border"}`} />
                    <Text className="text-content-secondary text-xs flex-1">
                      {e.minutes ? formatMinutes(e.minutes) : "En curso"}
                    </Text>
                    {e.note ? (
                      <Text className="text-content-muted text-xs flex-1" numberOfLines={1}>{e.note}</Text>
                    ) : null}
                    <Text className="text-content-muted text-[10px]">{timeAgo(e.startedAt)}</Text>
                  </View>
                ))}
              </View>
            )}
          </DetailSection>

          {/* Attachments */}
          <DetailSection title="Adjuntos" icon="attach-outline">
            {(attachments ?? []).length === 0 ? (
              <Text className="text-content-muted text-sm">Sin adjuntos</Text>
            ) : (
              <View className="gap-1">
                {attachments!.map((a, i) => (
                  <View
                    key={a.id}
                    className={`flex-row items-center gap-3 py-2.5 ${
                      i < attachments!.length - 1 ? "border-b border-dark-border/40" : ""
                    }`}
                  >
                    <View className="w-8 h-8 rounded-lg bg-brand/10 items-center justify-center">
                      <Ionicons
                        name={
                          a.contentType.startsWith("image/")
                            ? "image-outline"
                            : a.contentType === "application/pdf"
                            ? "document-text-outline"
                            : "document-outline"
                        }
                        size={16}
                        color="#7C3AED"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-content-primary text-xs font-medium" numberOfLines={1}>
                        {a.fileName}
                      </Text>
                      <Text className="text-content-muted text-[10px] mt-0.5">
                        {formatBytes(a.sizeBytes)} · {timeAgo(a.createdAt)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteAttachment(a)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={14} color={iconMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            <TouchableOpacity
              onPress={handlePickAttachment}
              disabled={uploadAttachment.isPending}
              className="flex-row items-center justify-center gap-1.5 mt-3 py-2.5 border border-dashed border-dark-border rounded-xl"
            >
              {uploadAttachment.isPending ? (
                <ActivityIndicator size={13} color={iconSecondary} />
              ) : (
                <Ionicons name="cloud-upload-outline" size={13} color={iconSecondary} />
              )}
              <Text className="text-content-secondary text-xs font-medium">
                {uploadAttachment.isPending ? "Subiendo…" : "Subir imagen"}
              </Text>
            </TouchableOpacity>
          </DetailSection>

          {/* POS context */}
          {ticket.posContext && Object.keys(ticket.posContext).length > 0 && (
            <DetailSection title="Contexto POS" icon="storefront-outline">
              {Object.entries(ticket.posContext).map(([k, v], i, arr) => (
                <DetailRow
                  key={k}
                  label={k}
                  value={String(v)}
                  last={i === arr.length - 1}
                />
              ))}
            </DetailSection>
          )}

          {/* Info */}
          <DetailSection title="Información" icon="information-circle-outline">
            <DetailRow label="Estado" value={STATUS_LABELS[ticket.status]} />
            <DetailRow label="Prioridad" value={PRIORITY_LABELS[ticket.priority]} />
            <DetailRow label="Origen" value={ticket.source} />
            {ticket.slaDueAt ? (
              <DetailRow
                label="SLA vence"
                value={new Date(ticket.slaDueAt).toLocaleString("es-MX", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
                warning={!!slaBreached}
              />
            ) : null}
            <DetailRow label="Comentarios" value={String(ticket.commentsCount)} />
            <DetailRow
              label="Creado"
              value={new Date(ticket.createdAt).toLocaleString("es-MX", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            />
            <DetailRow label="Actualizado" value={timeAgo(ticket.updatedAt)} last />
          </DetailSection>

          {/* Client */}
          {client && (
            <DetailSection title="Cliente" icon="business-outline">
              <DetailRow label="Nombre" value={client.name} />
              {client.primaryContactName ? (
                <DetailRow
                  label="Contacto"
                  value={client.primaryContactName}
                  last={!client.primaryEmail && !client.primaryPhone}
                />
              ) : null}
              {client.primaryPhone ? (
                <DetailRow
                  label="Teléfono"
                  value={client.primaryPhone}
                  last={!client.primaryEmail}
                />
              ) : null}
              {client.primaryEmail ? (
                <DetailRow label="Email" value={client.primaryEmail} last />
              ) : null}
            </DetailSection>
          )}

          {/* Labels */}
          {ticket.labels.length > 0 && (
            <DetailSection title="Etiquetas" icon="pricetag-outline">
              <View className="flex-row flex-wrap gap-2 mt-1">
                {ticket.labels.map((l) => (
                  <View key={l} className="bg-brand/10 border border-brand/20 px-2.5 py-1 rounded-full">
                    <Text className="text-xs text-brand-light">{l}</Text>
                  </View>
                ))}
              </View>
            </DetailSection>
          )}

          <View className="h-8" />
        </ScrollView>
      )}

      {/* ── Template picker modal ── */}
      <Modal
        visible={templatePickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setTemplatePickerOpen(false)}
      >
        <TemplatePicker
          templates={filteredTemplates}
          search={templateSearch}
          onSearchChange={setTemplateSearch}
          onSelect={handlePickTemplate}
          onClose={() => { setTemplatePickerOpen(false); setTemplateSearch(""); }}
          placeholder={placeholder}
          iconMuted={iconMuted}
          iconSecondary={iconSecondary}
          iconEmpty={iconEmpty}
        />
      </Modal>

      {/* ── Log time modal ── */}
      <Modal
        visible={logTimeOpen}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setLogTimeOpen(false)}
      >
        <LogTimeSheet
          minutes={logMinutes}
          note={logNote}
          onMinutesChange={setLogMinutes}
          onNoteChange={setLogNote}
          onSubmit={handleLogTime}
          onClose={() => { setLogTimeOpen(false); setLogMinutes(""); setLogNote(""); }}
          isPending={logTime.isPending}
          placeholder={placeholder}
          iconSecondary={iconSecondary}
        />
      </Modal>
    </KeyboardAvoidingView>
  );
}

/* ─── Template Picker ─── */

function TemplatePicker({
  templates,
  search,
  onSearchChange,
  onSelect,
  onClose,
  placeholder,
  iconMuted,
  iconSecondary,
  iconEmpty,
}: {
  templates: ResponseTemplate[];
  search: string;
  onSearchChange: (s: string) => void;
  onSelect: (t: ResponseTemplate) => void;
  onClose: () => void;
  placeholder: string;
  iconMuted: string;
  iconSecondary: string;
  iconEmpty: string;
}) {
  return (
    <View className="flex-1 bg-dark-bg">
      <View className="bg-dark-surface border-b border-dark-border pt-14 px-4 pb-4">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-content-primary font-bold text-lg">Plantillas de respuesta</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={iconSecondary} />
          </TouchableOpacity>
        </View>
        <View className="flex-row items-center bg-dark-raised border border-dark-border rounded-xl px-3 gap-2">
          <Ionicons name="search-outline" size={16} color={iconMuted} />
          <TextInput
            className="flex-1 py-3 text-content-primary text-sm"
            placeholder="Buscar plantilla…"
            placeholderTextColor={placeholder}
            value={search}
            onChangeText={onSearchChange}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => onSearchChange("")}>
              <Ionicons name="close-circle" size={16} color={iconMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={templates}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        renderItem={({ item: t }) => (
          <TouchableOpacity
            onPress={() => onSelect(t)}
            className="bg-dark-surface border border-dark-border rounded-2xl p-4"
            activeOpacity={0.7}
          >
            <View className="flex-row items-center justify-between mb-1.5">
              <Text className="text-content-primary font-semibold text-sm flex-1" numberOfLines={1}>
                {t.name}
              </Text>
              <View className="flex-row items-center gap-1.5 ml-2">
                {t.shortcut && (
                  <View className="bg-dark-raised border border-dark-border rounded px-1.5 py-0.5">
                    <Text className="text-content-muted font-mono text-[10px]">/{t.shortcut}</Text>
                  </View>
                )}
                {t.category && (
                  <View className="bg-brand/10 rounded-full px-2 py-0.5">
                    <Text className="text-brand-light text-[10px]">{t.category}</Text>
                  </View>
                )}
              </View>
            </View>
            <Text className="text-content-muted text-xs leading-4.5" numberOfLines={3}>
              {t.body}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View className="items-center py-16">
            <Ionicons name="flash-outline" size={40} color={iconEmpty} />
            <Text className="text-content-muted text-sm mt-3">
              {search ? "Sin resultados" : "Sin plantillas"}
            </Text>
            {!search && (
              <Text className="text-content-muted text-xs mt-1 text-center px-8">
                Crea plantillas de respuesta en Ajustes para usarlas aquí
              </Text>
            )}
          </View>
        }
      />
    </View>
  );
}

/* ─── Log Time Sheet ─── */

function LogTimeSheet({
  minutes,
  note,
  onMinutesChange,
  onNoteChange,
  onSubmit,
  onClose,
  isPending,
  placeholder,
  iconSecondary,
}: {
  minutes: string;
  note: string;
  onMinutesChange: (s: string) => void;
  onNoteChange: (s: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  isPending: boolean;
  placeholder: string;
  iconSecondary: string;
}) {
  const QUICK_OPTIONS = [15, 30, 60, 120];

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-dark-bg"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View className="bg-dark-surface border-b border-dark-border pt-14 px-4 pb-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-content-primary font-bold text-lg">Registrar tiempo</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={iconSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 p-4" keyboardShouldPersistTaps="handled">
        <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">
          Accesos rápidos
        </Text>
        <View className="flex-row gap-2 mb-4">
          {QUICK_OPTIONS.map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => onMinutesChange(String(m))}
              className={`flex-1 py-2.5 rounded-xl border items-center ${
                minutes === String(m)
                  ? "bg-brand border-brand"
                  : "bg-dark-raised border-dark-border"
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  minutes === String(m) ? "text-white" : "text-content-secondary"
                }`}
              >
                {formatMinutes(m)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">
          Minutos
        </Text>
        <TextInput
          className="bg-dark-surface border border-dark-border rounded-xl px-4 py-3 text-content-primary text-sm mb-4"
          placeholder="Ej: 45"
          placeholderTextColor={placeholder}
          value={minutes}
          onChangeText={onMinutesChange}
          keyboardType="numeric"
          returnKeyType="next"
        />

        <Text className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">
          Nota (opcional)
        </Text>
        <TextInput
          className="bg-dark-surface border border-dark-border rounded-xl px-4 py-3 text-content-primary text-sm mb-6"
          placeholder="¿En qué trabajaste?"
          placeholderTextColor={placeholder}
          value={note}
          onChangeText={onNoteChange}
          multiline
          numberOfLines={3}
          returnKeyType="done"
        />

        <TouchableOpacity
          onPress={onSubmit}
          disabled={isPending || !minutes}
          className={`py-4 rounded-2xl items-center ${
            minutes ? "bg-brand" : "bg-dark-raised"
          }`}
        >
          {isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className={`font-bold text-sm ${minutes ? "text-white" : "text-content-muted"}`}>
              Guardar
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ─── Sub-components ─── */

function MessageBubble({ comment }: { comment: TicketComment }) {
  const { iconMuted } = useAppTheme();
  const isAgent = comment.senderType === "AGENT";
  const isSystem = comment.senderType === "SYSTEM";

  if (isSystem) {
    return (
      <View className="items-center my-2">
        <Text
          className="text-xs text-content-muted bg-dark-raised px-3 py-1 rounded-full"
          selectable
        >
          {comment.content}
        </Text>
      </View>
    );
  }

  return (
    <View className={`mb-3 max-w-[85%] ${isAgent ? "self-end" : "self-start"}`}>
      {!isAgent && comment.authorName && (
        <View className="flex-row items-center gap-1 mb-1 ml-1">
          <Ionicons name="mail-outline" size={10} color={iconMuted} />
          <Text className="text-content-muted text-[10px]">{comment.authorName}</Text>
        </View>
      )}

      <View
        className={`rounded-2xl px-4 py-3 ${
          isAgent
            ? "bg-brand rounded-tr-sm"
            : "bg-dark-raised border border-dark-border rounded-tl-sm"
        }`}
      >
        <Text
          className={`text-sm leading-5 ${isAgent ? "text-white" : "text-content-primary"}`}
          selectable
        >
          {comment.content}
        </Text>
      </View>

      <View className={`flex-row items-center gap-1.5 mt-1 ${isAgent ? "justify-end mr-1" : "ml-1"}`}>
        {isAgent && comment.authorName && (
          <Text className="text-content-muted text-[10px]">{comment.authorName}</Text>
        )}
        <Text className="text-content-muted text-[10px]">{timeAgo(comment.createdAt)}</Text>
      </View>
    </View>
  );
}

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) {
  const { iconSecondary } = useAppTheme();
  return (
    <View className="bg-dark-surface border border-dark-border rounded-2xl overflow-hidden">
      <View className="flex-row items-center gap-2 px-4 pt-4 pb-2">
        <Ionicons name={icon} size={14} color={iconSecondary} />
        <Text className="text-content-secondary text-xs font-semibold uppercase tracking-wider">
          {title}
        </Text>
      </View>
      <View className="px-4 pb-4">{children}</View>
    </View>
  );
}

function DetailRow({
  label,
  value,
  warning = false,
  last = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
  last?: boolean;
}) {
  return (
    <View
      className={`py-2.5 ${!last ? "border-b border-dark-border/40" : ""}`}
    >
      <Text className="text-content-muted text-[10px] font-semibold uppercase tracking-wider mb-0.5">
        {label}
      </Text>
      <Text
        className={`text-sm font-medium leading-5 ${
          warning ? "text-red-400" : "text-content-secondary"
        }`}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}
