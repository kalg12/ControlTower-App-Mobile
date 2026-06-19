import { apiClient } from "./client";
import { PageResponse, Ticket, TicketComment, TicketListParams } from "@/types/ticket";

export async function getTickets(params: TicketListParams): Promise<PageResponse<Ticket>> {
  const res = await apiClient.get("/api/v1/tickets", { params });
  return res.data;
}

export async function getTicket(id: string): Promise<Ticket> {
  const res = await apiClient.get(`/api/v1/tickets/${id}`);
  return res.data;
}

export async function getTicketComments(id: string): Promise<TicketComment[]> {
  const res = await apiClient.get(`/api/v1/tickets/${id}/comments`);
  return res.data;
}

export async function addComment(ticketId: string, content: string): Promise<TicketComment> {
  const res = await apiClient.post(`/api/v1/tickets/${ticketId}/comments`, { content, internal: false });
  return res.data;
}

export async function updateTicketStatus(id: string, status: string): Promise<Ticket> {
  const res = await apiClient.patch(`/api/v1/tickets/${id}`, { status });
  return res.data;
}

export async function registerPushToken(token: string, platform: "android" | "ios"): Promise<void> {
  await apiClient.post("/api/v1/mobile/push-tokens", { token, platform });
}
