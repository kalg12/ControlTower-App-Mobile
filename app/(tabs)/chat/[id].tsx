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
import { useLocalSearchParams, router } from "expo-router";
import { useState, useRef, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useConversation,
  useMessages,
  useSendMessage,
  useCloseConversation,
  useMarkConversationRead,
} from "@/queries/chat.queries";
import { ChatMessage } from "@/types/chat";
import { timeAgo } from "@/utils/timeAgo";
import { useAppTheme } from "@/hooks/useAppTheme";

export default function ChatDetailScreen() {
  const { barStyle, statusBarBg, iconMuted, iconSecondary, iconEmpty, placeholder } = useAppTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [message, setMessage] = useState("");
  const flatRef = useRef<FlatList>(null);

  const { data: conversation, isLoading: loadingConv } = useConversation(id);
  const { data: messagesData, isLoading: loadingMsgs, fetchNextPage, hasNextPage } = useMessages(id);
  const sendMessage = useSendMessage(id);
  const closeConversation = useCloseConversation();
  const markRead = useMarkConversationRead();

  const messages = (messagesData?.pages.flatMap((p) => p.content) ?? []).slice().reverse();

  useEffect(() => {
    if (id) markRead.mutate(id);
  }, [id]);

  function handleSend() {
    if (!message.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendMessage.mutate(message.trim(), {
      onSuccess: () => {
        setMessage("");
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 150);
      },
      onError: () => Alert.alert("Error", "No se pudo enviar el mensaje"),
    });
  }

  function handleActions() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const options = ["Cerrar conversación", "Cancelar"];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 1, destructiveButtonIndex: 0 },
        (idx) => {
          if (idx === 0) handleClose();
        },
      );
    } else {
      Alert.alert("Acciones", undefined, [
        {
          text: "Cerrar conversación",
          style: "destructive",
          onPress: handleClose,
        },
        { text: "Cancelar", style: "cancel" },
      ]);
    }
  }

  function handleClose() {
    closeConversation.mutate(id, {
      onSuccess: () => router.back(),
      onError: () => Alert.alert("Error", "No se pudo cerrar la conversación"),
    });
  }

  if (loadingConv || loadingMsgs) {
    return (
      <View className="flex-1 bg-dark-bg items-center justify-center">
        <StatusBar barStyle={barStyle} backgroundColor={statusBarBg} />
        <ActivityIndicator color="#7C3AED" size="large" />
      </View>
    );
  }

  if (!conversation) {
    return (
      <View className="flex-1 bg-dark-bg items-center justify-center">
        <StatusBar barStyle={barStyle} backgroundColor={statusBarBg} />
        <Ionicons name="alert-circle-outline" size={48} color={iconEmpty} />
        <Text className="text-content-secondary mt-3">Conversación no encontrada</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-brand-light text-sm">Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isClosed = conversation.status === "CLOSED" || conversation.status === "ARCHIVED";
  const visitorLabel = conversation.visitorName ?? conversation.visitorEmail ?? "Visitante";

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-dark-bg"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle={barStyle} backgroundColor={statusBarBg} />

      {/* Header */}
      <View className="bg-dark-surface border-b border-dark-border pt-14 pb-3 px-4">
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={22} color={iconSecondary} />
          </TouchableOpacity>

          <View className="w-9 h-9 rounded-full bg-brand/20 items-center justify-center">
            <Text className="text-brand-light font-bold text-sm">
              {visitorLabel[0].toUpperCase()}
            </Text>
          </View>

          <View className="flex-1">
            <Text className="text-content-primary font-bold text-base" numberOfLines={1}>
              {visitorLabel}
            </Text>
            {conversation.visitorEmail && conversation.visitorName && (
              <Text className="text-content-muted text-xs">{conversation.visitorEmail}</Text>
            )}
          </View>

          <View className="flex-row items-center gap-2">
            {!isClosed && (
              <View className="bg-emerald-500/15 border border-emerald-500/30 rounded-full px-2 py-0.5">
                <Text className="text-emerald-400 text-[10px] font-semibold">
                  {conversation.status === "ACTIVE" ? "Activo" : "En espera"}
                </Text>
              </View>
            )}
            {isClosed && (
              <View className="bg-dark-raised border border-dark-border rounded-full px-2 py-0.5">
                <Text className="text-content-muted text-[10px] font-semibold">Cerrado</Text>
              </View>
            )}
            {!isClosed && (
              <TouchableOpacity
                onPress={handleActions}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={iconSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {conversation.source && (
          <View className="flex-row items-center gap-1 mt-2 ml-[52]">
            <Ionicons name="globe-outline" size={10} color={iconMuted} />
            <Text className="text-content-muted text-[10px]">via {conversation.source}</Text>
          </View>
        )}
      </View>

      {/* Messages */}
      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
        renderItem={({ item }) => <ChatBubble message={item} />}
        onEndReached={() => hasNextPage && fetchNextPage()}
        onEndReachedThreshold={0.1}
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View className="items-center py-16">
            <Ionicons name="chatbubble-outline" size={40} color={iconEmpty} />
            <Text className="text-content-muted text-sm mt-3">Sin mensajes todavía</Text>
          </View>
        }
      />

      {/* Input — only when not closed */}
      {isClosed ? (
        <View className="bg-dark-surface border-t border-dark-border px-4 py-4 items-center">
          <Text className="text-content-muted text-sm">Esta conversación está cerrada</Text>
        </View>
      ) : (
        <View className="bg-dark-surface border-t border-dark-border px-3 py-3 flex-row items-end gap-2">
          <TextInput
            className="flex-1 bg-dark-raised border border-dark-border rounded-2xl px-4 py-3 text-content-primary text-sm max-h-28"
            placeholder="Escribe un mensaje..."
            placeholderTextColor={placeholder}
            value={message}
            onChangeText={setMessage}
            multiline
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!message.trim() || sendMessage.isPending}
            className={`w-11 h-11 rounded-full items-center justify-center ${
              message.trim() ? "bg-brand" : "bg-dark-raised"
            }`}
          >
            {sendMessage.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="send" size={16} color={message.trim() ? "#fff" : iconMuted} />
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function ChatBubble({ message: m }: { message: ChatMessage }) {
  const { iconMuted } = useAppTheme();
  const isAgent = m.senderType === "AGENT";
  const isSystem = m.senderType === "SYSTEM";

  if (isSystem) {
    return (
      <View className="items-center my-2">
        <Text className="text-xs text-content-muted bg-dark-raised px-3 py-1 rounded-full">
          {m.content}
        </Text>
      </View>
    );
  }

  return (
    <View className={`mb-3 max-w-[82%] ${isAgent ? "self-end" : "self-start"}`}>
      {!isAgent && m.senderName && (
        <View className="flex-row items-center gap-1 mb-1 ml-1">
          <View className="w-4 h-4 rounded-full bg-brand/20 items-center justify-center">
            <Text className="text-brand-light font-bold" style={{ fontSize: 7 }}>
              {m.senderName[0].toUpperCase()}
            </Text>
          </View>
          <Text className="text-content-muted text-[10px]">{m.senderName}</Text>
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
          {m.content}
        </Text>
      </View>

      <View className={`flex-row items-center gap-1.5 mt-1 ${isAgent ? "justify-end mr-1" : "ml-1"}`}>
        <Text className="text-content-muted text-[10px]">{timeAgo(m.createdAt)}</Text>
        {isAgent && (
          <Ionicons
            name={m.isRead ? "checkmark-done" : "checkmark"}
            size={10}
            color={m.isRead ? "#7C3AED" : iconMuted}
          />
        )}
      </View>
    </View>
  );
}
