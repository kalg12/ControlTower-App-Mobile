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
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useState, useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  useTicket,
  useTicketComments,
  useAddComment,
  useUpdateTicketStatus,
} from "@/queries/tickets.queries";
import { TicketComment, TicketStatus } from "@/types/ticket";
import { timeAgo } from "@/utils/timeAgo";

const STATUS_OPTIONS: TicketStatus[] = [
  "OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED",
];
const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En progreso",
  WAITING: "En espera",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
};
const STATUS_BADGE: Record<TicketStatus, string> = {
  OPEN:        "bg-blue-500/15 text-blue-400",
  IN_PROGRESS: "bg-amber-500/15 text-amber-400",
  WAITING:     "bg-yellow-500/15 text-yellow-300",
  RESOLVED:    "bg-emerald-500/15 text-emerald-400",
  CLOSED:      "bg-dark-raised text-content-muted",
};
const PRIORITY_BADGE: Record<string, string> = {
  CRITICAL: "bg-red-500/15 text-red-400",
  HIGH:     "bg-orange-500/15 text-orange-400",
  MEDIUM:   "bg-amber-500/15 text-amber-400",
  LOW:      "bg-dark-raised text-content-muted",
};
const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: "CRÍTICO", HIGH: "ALTO", MEDIUM: "MEDIO", LOW: "BAJO",
};

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [reply, setReply] = useState("");
  const flatRef = useRef<FlatList>(null);

  const { data: ticket, isLoading: loadingTicket } = useTicket(id);
  const { data: comments, isLoading: loadingComments } = useTicketComments(id);
  const addComment = useAddComment(id);
  const updateStatus = useUpdateTicketStatus(id);

  function handleSend() {
    if (!reply.trim()) return;
    addComment.mutate(reply.trim(), {
      onSuccess: () => {
        setReply("");
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 200);
      },
      onError: () => Alert.alert("Error", "No se pudo enviar la respuesta"),
    });
  }

  function handleChangeStatus() {
    const options = STATUS_OPTIONS.map((s) => STATUS_LABELS[s]);
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...options, "Cancelar"], cancelButtonIndex: options.length },
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
        <ActivityIndicator color="#7C3AED" size="large" />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View className="flex-1 bg-dark-bg items-center justify-center">
        <Text className="text-content-secondary">Ticket no encontrado</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-dark-bg"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0C0C14" />

      {/* Ticket header */}
      <View className="bg-dark-surface border-b border-dark-border px-4 pt-4 pb-4">
        <Text className="text-content-primary font-bold text-base leading-6 mb-3" numberOfLines={3}>
          {ticket.title}
        </Text>

        <View className="flex-row flex-wrap gap-2 items-center">
          {/* Status — tappable */}
          <TouchableOpacity onPress={handleChangeStatus}>
            <View className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full ${STATUS_BADGE[ticket.status]}`}>
              <Text className={`text-xs font-semibold ${STATUS_BADGE[ticket.status].split(" ")[1]}`}>
                {STATUS_LABELS[ticket.status].toUpperCase()}
              </Text>
              <Ionicons name="chevron-down" size={10} color="currentColor" />
            </View>
          </TouchableOpacity>

          {/* Priority */}
          <View className={`px-2.5 py-1 rounded-full ${PRIORITY_BADGE[ticket.priority]}`}>
            <Text className={`text-xs font-semibold ${PRIORITY_BADGE[ticket.priority].split(" ")[1]}`}>
              {PRIORITY_LABELS[ticket.priority]}
            </Text>
          </View>

          {/* Source */}
          <View className="bg-dark-raised border border-dark-border px-2.5 py-1 rounded-full flex-row items-center gap-1">
            <Ionicons name="git-branch-outline" size={10} color="#4A4A5C" />
            <Text className="text-content-muted text-xs font-semibold">{ticket.source}</Text>
          </View>
        </View>

        {ticket.requesterEmail && (
          <View className="flex-row items-center gap-1 mt-2.5">
            <Ionicons name="person-outline" size={12} color="#4A4A5C" />
            <Text className="text-content-muted text-xs">{ticket.requesterEmail}</Text>
            <Text className="text-content-muted text-xs mx-1">·</Text>
            <Ionicons name="time-outline" size={12} color="#4A4A5C" />
            <Text className="text-content-muted text-xs">{timeAgo(ticket.createdAt)}</Text>
          </View>
        )}
      </View>

      {/* Messages */}
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
          contentContainerStyle={{ padding: 12, paddingBottom: 4 }}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Ionicons name="chatbubble-outline" size={40} color="#2A2A3C" />
              <Text className="text-content-muted text-sm mt-3">Sin mensajes todavía</Text>
            </View>
          }
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Reply input */}
      <View className="bg-dark-surface border-t border-dark-border px-3 py-3 flex-row items-end gap-2">
        <TextInput
          className="flex-1 bg-dark-raised border border-dark-border rounded-2xl px-4 py-3 text-content-primary text-sm max-h-28"
          placeholder="Escribe una respuesta..."
          placeholderTextColor="#4A4A5C"
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
            <Ionicons
              name="send"
              size={16}
              color={reply.trim() ? "#fff" : "#4A4A5C"}
            />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ comment }: { comment: TicketComment }) {
  const isAgent = comment.source === "AGENT";
  const isSystem = comment.source === "SYSTEM";

  if (isSystem) {
    return (
      <View className="items-center my-2">
        <Text className="text-xs text-content-muted bg-dark-raised px-3 py-1 rounded-full">
          {comment.content}
        </Text>
      </View>
    );
  }

  return (
    <View className={`mb-3 max-w-[85%] ${isAgent ? "self-end" : "self-start"}`}>
      {!isAgent && (
        <View className="flex-row items-center gap-1 mb-1 ml-1">
          <Ionicons name="mail-outline" size={10} color="#4A4A5C" />
          <Text className="text-content-muted text-[10px]">Email</Text>
        </View>
      )}
      <View
        className={`rounded-2xl px-4 py-3 ${
          isAgent
            ? "bg-brand rounded-tr-sm"
            : "bg-dark-raised border border-dark-border rounded-tl-sm"
        }`}
      >
        <Text className={`text-sm leading-5 ${isAgent ? "text-white" : "text-content-primary"}`}>
          {comment.content}
        </Text>
      </View>
      <Text className={`text-[10px] text-content-muted mt-1 ${isAgent ? "text-right mr-1" : "ml-1"}`}>
        {timeAgo(comment.createdAt)}
      </Text>
    </View>
  );
}
