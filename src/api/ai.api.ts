import { apiClient } from "./client";

export type AiTask = "GENERATE_CARD_PROMPT" | "IMPROVE_TICKET_REPLY" | "QUICK_REPLY";

export type QuickReplyType =
  | "STARTED_REVIEW"
  | "WAITING_CLIENT"
  | "CLOSE_TICKET"
  | "NEED_INFO"
  | "SCHEDULE_CALL";

export interface AiContext {
  // Kanban card context
  cardTitle?: string;
  cardDescription?: string;
  cardChecklist?: string[];
  cardPriority?: string;
  boardName?: string;
  clientName?: string;
  // Ticket context
  ticketSubject?: string;
  ticketDescription?: string;
  draftReply?: string;
  quickReplyType?: QuickReplyType;
}

export interface AiAssistRequest {
  task: AiTask;
  context: AiContext;
}

export async function aiAssist(request: AiAssistRequest): Promise<string> {
  const res = await apiClient.post("/api/v1/ai/assist", request);
  return res.data?.data?.result ?? res.data?.result ?? "";
}
