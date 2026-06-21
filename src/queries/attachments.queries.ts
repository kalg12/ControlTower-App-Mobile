import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTicketAttachments,
  uploadTicketAttachment,
  deleteTicketAttachment,
} from "@/api/attachments.api";

export const attachmentKeys = {
  all: ["attachments"] as const,
  ticket: (ticketId: string) => ["attachments", "ticket", ticketId] as const,
};

export function useTicketAttachments(ticketId: string) {
  return useQuery({
    queryKey: attachmentKeys.ticket(ticketId),
    queryFn: () => getTicketAttachments(ticketId),
    enabled: !!ticketId,
  });
}

export function useUploadAttachment(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: { uri: string; name: string; type: string }) =>
      uploadTicketAttachment(ticketId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: attachmentKeys.ticket(ticketId) }),
  });
}

export function useDeleteAttachment(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) => deleteTicketAttachment(ticketId, attachmentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: attachmentKeys.ticket(ticketId) }),
  });
}
