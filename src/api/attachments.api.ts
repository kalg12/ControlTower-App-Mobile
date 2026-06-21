import { apiClient } from "./client";
import { TicketAttachment } from "@/types/time";

export async function getTicketAttachments(ticketId: string): Promise<TicketAttachment[]> {
  const res = await apiClient.get(`/api/v1/tickets/${ticketId}/attachments`);
  return res.data ?? [];
}

export async function uploadTicketAttachment(
  ticketId: string,
  file: { uri: string; name: string; type: string },
): Promise<TicketAttachment> {
  const form = new FormData();
  form.append("file", { uri: file.uri, name: file.name, type: file.type } as any);
  const res = await apiClient.post(`/api/v1/tickets/${ticketId}/attachments`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function deleteTicketAttachment(ticketId: string, attachmentId: string): Promise<void> {
  await apiClient.delete(`/api/v1/tickets/${ticketId}/attachments/${attachmentId}`);
}
