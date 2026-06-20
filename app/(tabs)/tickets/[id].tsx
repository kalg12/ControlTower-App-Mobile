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
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useState, useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import {
  useTicket,
  useTicketComments,
  useAddComment,
  useUpdateTicketStatus,
} from "@/queries/tickets.queries";
import { TicketComment, TicketStatus } from "@/types/ticket";
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

export default function TicketDetailScreen() {
  const { barStyle, statusBarBg, iconMuted, iconSecondary, iconEmpty, placeholder } = useAppTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [reply, setReply] = useState("");
  const [tab, setTab] = useState<"conversation" | "details">("conversation");
  const flatRef = useRef<FlatList>(null);

  const { data: ticket, isLoading: loadingTicket, refetch: refetchTicket, isRefetching: refetchingTicket } = useTicket(id);
  const { data: comments, isLoading: loadingComments, refetch: refetchComments, isRefetching: refetchingComments } = useTicketComments(id);
  const addComment = useAddComment(id);
  const updateStatus = useUpdateTicketStatus(id);

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
          <View className="bg-dark-surface border-t border-dark-border px-3 py-3 flex-row items-end gap-2">
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
            {ticket.estimatedMinutes ? (
              <DetailRow
                label="Tiempo estimado"
                value={
                  ticket.estimatedMinutes >= 60
                    ? `${Math.floor(ticket.estimatedMinutes / 60)}h ${ticket.estimatedMinutes % 60}m`
                    : `${ticket.estimatedMinutes}m`
                }
              />
            ) : null}
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
        </ScrollView>
      )}
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
