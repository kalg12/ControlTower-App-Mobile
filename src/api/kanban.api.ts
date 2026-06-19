import { apiClient } from "./client";
import {
  Board,
  CreateBoardPayload,
  CreateCardPayload,
  UpdateCardPayload,
  MoveCardPayload,
  KanbanCard,
  KanbanColumn,
  ChecklistItem,
} from "@/types/kanban";
import { PageResponse } from "@/types/ticket";

export async function getBoards(page = 0, clientId?: string): Promise<PageResponse<Board>> {
  const res = await apiClient.get("/api/v1/boards", {
    params: { page, size: 20, ...(clientId ? { clientId } : {}) },
  });
  return res.data;
}

export async function getBoard(id: string): Promise<Board> {
  const res = await apiClient.get(`/api/v1/boards/${id}`);
  return res.data;
}

export async function createBoard(payload: CreateBoardPayload): Promise<Board> {
  const res = await apiClient.post("/api/v1/boards", payload);
  return res.data;
}

export async function updateBoard(id: string, payload: CreateBoardPayload): Promise<Board> {
  const res = await apiClient.put(`/api/v1/boards/${id}`, payload);
  return res.data;
}

export async function deleteBoard(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/boards/${id}`);
}

export async function addColumn(
  boardId: string,
  name: string,
  position: number
): Promise<KanbanColumn> {
  const res = await apiClient.post(`/api/v1/boards/${boardId}/columns`, null, {
    params: { name, position },
  });
  return res.data;
}

export async function deleteColumn(columnId: string): Promise<void> {
  await apiClient.delete(`/api/v1/boards/columns/${columnId}`);
}

export async function createCard(payload: CreateCardPayload): Promise<KanbanCard> {
  const res = await apiClient.post("/api/v1/boards/cards", payload);
  return res.data;
}

export async function updateCard(cardId: string, payload: UpdateCardPayload): Promise<KanbanCard> {
  const res = await apiClient.patch(`/api/v1/boards/cards/${cardId}`, payload);
  return res.data;
}

export async function moveCard(cardId: string, payload: MoveCardPayload): Promise<KanbanCard> {
  const res = await apiClient.patch(`/api/v1/boards/cards/${cardId}/move`, payload);
  return res.data;
}

export async function deleteCard(cardId: string): Promise<void> {
  await apiClient.delete(`/api/v1/boards/cards/${cardId}`);
}

export async function addChecklistItem(cardId: string, text: string): Promise<ChecklistItem> {
  const res = await apiClient.post(`/api/v1/boards/cards/${cardId}/checklist`, null, {
    params: { text },
  });
  return res.data;
}

export async function toggleChecklistItem(itemId: string): Promise<ChecklistItem> {
  const res = await apiClient.patch(`/api/v1/boards/checklist/${itemId}/toggle`);
  return res.data;
}

export async function getTenantUsers(): Promise<
  { id: string; fullName: string; email: string }[]
> {
  const res = await apiClient.get("/api/v1/users", { params: { size: 100 } });
  const content = res.data?.content ?? res.data ?? [];
  return content.map((u: { id: string; fullName: string; email: string }) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
  }));
}
