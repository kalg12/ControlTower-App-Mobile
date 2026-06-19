import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTicket,
  getTicketComments,
  addComment,
  getTickets,
  getTicketStats,
  updateTicketStatus,
} from "@/api/tickets.api";
import { TicketListParams } from "@/types/ticket";

export const ticketKeys = {
  all: ["tickets"] as const,
  stats: () => [...ticketKeys.all, "stats"] as const,
  list: (params: TicketListParams) => [...ticketKeys.all, "list", params] as const,
  detail: (id: string) => [...ticketKeys.all, id] as const,
  comments: (id: string) => [...ticketKeys.all, id, "comments"] as const,
};

export function useTicketStats() {
  return useQuery({
    queryKey: ticketKeys.stats(),
    queryFn: getTicketStats,
    staleTime: 60_000,
  });
}

export function useInfiniteTickets(params: Omit<TicketListParams, "page">) {
  return useInfiniteQuery({
    queryKey: ticketKeys.list(params),
    queryFn: ({ pageParam = 0 }) =>
      getTickets({ ...params, page: pageParam as number, size: 20 }),
    getNextPageParam: (last) => (last.last ? undefined : last.page + 1),
    initialPageParam: 0,
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ticketKeys.detail(id),
    queryFn: () => getTicket(id),
    enabled: !!id,
  });
}

export function useTicketComments(ticketId: string) {
  return useQuery({
    queryKey: ticketKeys.comments(ticketId),
    queryFn: () => getTicketComments(ticketId),
    enabled: !!ticketId,
  });
}

export function useAddComment(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => addComment(ticketId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ticketKeys.comments(ticketId) }),
  });
}

export function useUpdateTicketStatus(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: string) => updateTicketStatus(ticketId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKeys.detail(ticketId) });
      qc.invalidateQueries({ queryKey: ticketKeys.all });
    },
  });
}
