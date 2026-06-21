export type ConversationStatus = "WAITING" | "ACTIVE" | "CLOSED" | "ARCHIVED";
export type ChatSenderType = "VISITOR" | "AGENT" | "SYSTEM";

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderType: ChatSenderType;
  senderId?: string;
  senderName?: string;
  senderAvatarUrl?: string;
  content: string;
  attachmentUrl?: string;
  isRead: boolean;
  createdAt: string;
}

export interface ChatConversation {
  id: string;
  tenantId: string;
  visitorId: string;
  visitorName?: string;
  visitorEmail?: string;
  agentId?: string;
  agentName?: string;
  agentAvatarUrl?: string;
  status: ConversationStatus;
  source?: string;
  unreadCount: number;
  messages?: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}
