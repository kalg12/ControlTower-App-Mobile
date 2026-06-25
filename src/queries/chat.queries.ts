import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  InfiniteData,
} from "@tanstack/react-query";
import {
  getConversations,
  getConversation,
  getMessages,
  sendMessage,
  claimConversation,
  transferConversation,
  closeConversation,
  markConversationRead,
} from "@/api/chat.api";
import { ConversationStatus } from "@/types/chat";

export const chatKeys = {
  all: ["chat"] as const,
  conversations: (status?: ConversationStatus) => ["chat", "conversations", status] as const,
  conversation: (id: string) => ["chat", "conversation", id] as const,
  messages: (conversationId: string) => ["chat", "messages", conversationId] as const,
};

export function useConversations(status?: ConversationStatus) {
  return useInfiniteQuery({
    queryKey: chatKeys.conversations(status),
    queryFn: ({ pageParam = 0 }) => getConversations(status, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (last, _, lastPageParam) =>
      last.last ? undefined : (lastPageParam as number) + 1,
    staleTime: 10_000,
    refetchInterval: 15_000,   // poll every 15 s — new conversations appear without pull-to-refresh
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: chatKeys.conversation(id),
    queryFn: () => getConversation(id),
    enabled: !!id,
  });
}

export function useMessages(conversationId: string) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(conversationId),
    queryFn: ({ pageParam = 0 }) => getMessages(conversationId, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (last, _, lastPageParam) =>
      last.last ? undefined : (lastPageParam as number) + 1,
    staleTime: 3_000,
    refetchInterval: 6_000,    // poll every 6 s — visitor messages appear without manual refresh
  });
}

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => sendMessage(conversationId, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
      qc.invalidateQueries({ queryKey: chatKeys.conversation(conversationId) });
    },
  });
}

export function useClaimConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => claimConversation(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: chatKeys.conversations() });
      qc.setQueryData(chatKeys.conversation(data.id), data);
    },
  });
}

export function useTransferConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, agentId }: { id: string; agentId: string }) =>
      transferConversation(id, agentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.all }),
  });
}

export function useCloseConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => closeConversation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.all }),
  });
}

export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markConversationRead(id),
    onSuccess: (_, id) => qc.invalidateQueries({ queryKey: chatKeys.conversation(id) }),
  });
}
