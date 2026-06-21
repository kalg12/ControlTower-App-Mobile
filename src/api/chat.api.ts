import { apiClient } from "./client";
import { ChatConversation, ChatMessage, ConversationStatus } from "@/types/chat";

export async function getConversations(
  status?: ConversationStatus,
  page = 0,
  size = 20,
): Promise<{ content: ChatConversation[]; totalElements: number; last: boolean }> {
  const res = await apiClient.get("/api/v1/chat/conversations", {
    params: { status, page, size },
  });
  return res.data;
}

export async function getConversation(id: string): Promise<ChatConversation> {
  const res = await apiClient.get(`/api/v1/chat/conversations/${id}`);
  return res.data;
}

export async function getMessages(
  conversationId: string,
  page = 0,
  size = 30,
): Promise<{ content: ChatMessage[]; totalElements: number; last: boolean }> {
  const res = await apiClient.get(`/api/v1/chat/conversations/${conversationId}/messages`, {
    params: { page, size },
  });
  return res.data;
}

export async function sendMessage(
  conversationId: string,
  content: string,
): Promise<ChatMessage> {
  const res = await apiClient.post(`/api/v1/chat/conversations/${conversationId}/messages`, {
    content,
  });
  return res.data;
}

export async function claimConversation(id: string): Promise<ChatConversation> {
  const res = await apiClient.post(`/api/v1/chat/conversations/${id}/claim`);
  return res.data;
}

export async function transferConversation(id: string, agentId: string): Promise<ChatConversation> {
  const res = await apiClient.post(`/api/v1/chat/conversations/${id}/transfer`, { agentId });
  return res.data;
}

export async function closeConversation(id: string): Promise<ChatConversation> {
  const res = await apiClient.post(`/api/v1/chat/conversations/${id}/close`);
  return res.data;
}

export async function markConversationRead(id: string): Promise<void> {
  await apiClient.post(`/api/v1/chat/conversations/${id}/read`);
}
