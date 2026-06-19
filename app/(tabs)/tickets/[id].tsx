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
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useState, useRef } from "react";
import { useTicket, useTicketComments, useAddComment, useUpdateTicketStatus } from "@/queries/tickets.queries";
import { TicketComment, TicketStatus } from "@/types/ticket";
import { timeAgo } from "@/utils/timeAgo";

const STATUS_OPTIONS: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"];

const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En progreso",
  WAITING: "En espera",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
};

const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: "Crítico",
  HIGH: "Alto",
  MEDIUM: "Medio",
  LOW: "Bajo",
};

const PRIORITY_BADGE: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  LOW: "bg-gray-100 text-gray-600",
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
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...STATUS_OPTIONS.map((s) => STATUS_LABELS[s]), "Cancelar"],
          cancelButtonIndex: STATUS_OPTIONS.length,
        },
        (idx) => {
          if (idx < STATUS_OPTIONS.length) {
            updateStatus.mutate(STATUS_OPTIONS[idx]);
          }
        }
      );
    } else {
      Alert.alert(
        "Cambiar estado",
        undefined,
        [
          ...STATUS_OPTIONS.map((s) => ({
            text: STATUS_LABELS[s],
            onPress: () => updateStatus.mutate(s),
          })),
          { text: "Cancelar", style: "cancel" as const },
        ]
      );
    }
  }

  if (loadingTicket) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#F96E1B" size="large" />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-gray-500">Ticket no encontrado</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      {/* Ticket header */}
      <View className="bg-white border-b border-gray-200 px-4 py-3">
        <Text className="text-base font-bold text-gray-900 mb-2" numberOfLines={2}>
          {ticket.title}
        </Text>
        <View className="flex-row items-center gap-2 flex-wrap">
          <Badge
            label={PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
            className={PRIORITY_BADGE[ticket.priority] ?? "bg-gray-100 text-gray-600"}
          />
          <TouchableOpacity onPress={handleChangeStatus}>
            <Badge
              label={STATUS_LABELS[ticket.status] ?? ticket.status}
              className="bg-brand/10 text-brand"
              suffix=" ▾"
            />
          </TouchableOpacity>
          {ticket.requesterEmail && (
            <Text className="text-gray-500 text-xs">{ticket.requesterEmail}</Text>
          )}
        </View>
      </View>

      {/* Messages */}
      {loadingComments ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#F96E1B" />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={comments ?? []}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <MessageBubble comment={item} />}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          ListEmptyComponent={
            <View className="items-center py-12">
              <Text className="text-gray-400 text-sm">Sin mensajes todavía</Text>
            </View>
          }
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Reply input */}
      <View className="bg-white border-t border-gray-200 px-4 py-3 flex-row items-end gap-3">
        <TextInput
          className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 text-gray-900 text-sm max-h-28"
          placeholder="Escribe una respuesta..."
          placeholderTextColor="#9CA3AF"
          value={reply}
          onChangeText={setReply}
          multiline
          returnKeyType="default"
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!reply.trim() || addComment.isPending}
          className={`rounded-full w-11 h-11 items-center justify-center ${
            reply.trim() ? "bg-brand" : "bg-gray-200"
          }`}
        >
          {addComment.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white text-lg">↑</Text>
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
      <View className="items-center my-1">
        <Text className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
          {comment.content}
        </Text>
      </View>
    );
  }

  return (
    <View className={`max-w-[85%] ${isAgent ? "self-end" : "self-start"}`}>
      <View
        className={`rounded-2xl px-4 py-3 ${
          isAgent ? "bg-brand rounded-tr-sm" : "bg-white rounded-tl-sm shadow-sm"
        }`}
      >
        <Text className={`text-sm ${isAgent ? "text-white" : "text-gray-900"}`}>
          {comment.content}
        </Text>
      </View>
      <Text className={`text-xs text-gray-400 mt-1 ${isAgent ? "text-right" : "text-left"}`}>
        {timeAgo(comment.createdAt)}
        {!isAgent && comment.source === "EMAIL" && " · Email"}
      </Text>
    </View>
  );
}

function Badge({
  label,
  className,
  suffix = "",
}: {
  label: string;
  className: string;
  suffix?: string;
}) {
  return (
    <View className={`px-2 py-0.5 rounded-full ${className.split(" ")[0]}`}>
      <Text className={`text-xs font-medium ${className.split(" ")[1]}`}>
        {label}{suffix}
      </Text>
    </View>
  );
}
