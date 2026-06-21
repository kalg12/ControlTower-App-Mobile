import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Board,
  KanbanCard,
  CreateCardPayload,
  UpdateCardPayload,
} from "@/types/kanban";
import {
  getBoard,
  addColumn,
  deleteColumn,
  createCard,
  updateCard,
  moveCard,
  deleteCard,
  addChecklistItem,
  toggleChecklistItem,
  getTenantUsers,
  getClients,
} from "@/api/kanban.api";

export type TenantUser = { id: string; fullName: string; email: string; avatarUrl?: string };
export type ClientOption = { id: string; name: string };

/* ─── Cache key ─── */

export const boardKey = (id: string) => ["boards", "detail", id] as const;

/* ─── Utility to patch a single card in the board tree ─── */

function patchCard(
  board: Board,
  cardId: string,
  fn: (c: KanbanCard) => KanbanCard,
): Board {
  return {
    ...board,
    columns: board.columns.map((col) => ({
      ...col,
      cards: col.cards.map((c) => (c.id === cardId ? fn(c) : c)),
    })),
  };
}

/* ─── Generic optimistic mutation factory ─── */

function useOptimistic<TVar>(
  boardId: string,
  mutationFn: (vars: TVar) => Promise<unknown>,
  optimisticUpdate: (board: Board, vars: TVar) => Board,
) {
  const qc = useQueryClient();
  const key = boardKey(boardId);
  return useMutation<unknown, Error, TVar, { snapshot: Board | undefined }>({
    mutationFn,
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueryData<Board>(key);
      if (snapshot) qc.setQueryData<Board>(key, optimisticUpdate(snapshot, vars));
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(key, ctx.snapshot);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/* ─── Queries ─── */

export function useBoard(boardId: string) {
  return useQuery({
    queryKey: boardKey(boardId),
    queryFn: () => getBoard(boardId),
    staleTime: 0,
    retry: false,
    enabled: !!boardId,
  });
}

export function useTenantUsers() {
  return useQuery({
    queryKey: ["users", "tenant"],
    queryFn: getTenantUsers,
    staleTime: 5 * 60_000,
  });
}

export function useClients(q?: string) {
  return useQuery({
    queryKey: ["clients", "list", q ?? ""],
    queryFn: () => getClients(q),
    staleTime: 2 * 60_000,
  });
}

/* ─── Mutations with optimistic updates ─── */

export function useAddColumn(boardId: string) {
  return useOptimistic<{ name: string; position: number }>(
    boardId,
    ({ name, position }) => addColumn(boardId, name, position),
    (old, { name, position }) => ({
      ...old,
      columns: [
        ...old.columns,
        {
          id: `opt-col-${Date.now()}`,
          boardId,
          name,
          columnKind: "CUSTOM",
          position,
          cards: [],
          createdAt: new Date().toISOString(),
        },
      ],
    }),
  );
}

export function useDeleteColumn(boardId: string) {
  return useOptimistic<string>(
    boardId,
    deleteColumn,
    (old, colId) => ({
      ...old,
      columns: old.columns.filter((c) => c.id !== colId),
    }),
  );
}

export function useCreateCard(boardId: string) {
  return useOptimistic<CreateCardPayload>(
    boardId,
    createCard,
    (old, payload) => ({
      ...old,
      columns: old.columns.map((col) =>
        col.id === payload.columnId
          ? {
              ...col,
              cards: [
                ...col.cards,
                {
                  id: `opt-card-${Date.now()}`,
                  columnId: payload.columnId,
                  title: payload.title,
                  description: payload.description,
                  assigneeIds: payload.assigneeIds ?? [],
                  dueDate: payload.dueDate,
                  priority: payload.priority ?? "MEDIUM",
                  position: 9999,
                  labels: [],
                  checklist: [],
                  estimatedMinutes: payload.estimatedMinutes,
                  clientId: payload.clientId,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
            }
          : col,
      ),
    }),
  );
}

export function useUpdateCard(boardId: string) {
  return useOptimistic<{ id: string; payload: UpdateCardPayload }>(
    boardId,
    ({ id, payload }) => updateCard(id, payload),
    (old, { id, payload }) =>
      patchCard(old, id, (c) => ({
        ...c,
        ...payload,
        updatedAt: new Date().toISOString(),
      })),
  );
}

export function useMoveCard(boardId: string) {
  return useOptimistic<{ cardId: string; targetColumnId: string }>(
    boardId,
    ({ cardId, targetColumnId }) => moveCard(cardId, { targetColumnId }),
    (old, { cardId, targetColumnId }) => {
      let moving: KanbanCard | undefined;
      const cols = old.columns.map((col) => {
        const idx = col.cards.findIndex((c) => c.id === cardId);
        if (idx !== -1) {
          moving = col.cards[idx];
          return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
        }
        return col;
      });
      if (!moving) return old;
      const updated = {
        ...moving,
        columnId: targetColumnId,
        updatedAt: new Date().toISOString(),
      };
      return {
        ...old,
        columns: cols.map((col) =>
          col.id === targetColumnId
            ? { ...col, cards: [...col.cards, updated] }
            : col,
        ),
      };
    },
  );
}

export function useDeleteCard(boardId: string) {
  return useOptimistic<string>(
    boardId,
    deleteCard,
    (old, cardId) => ({
      ...old,
      columns: old.columns.map((col) => ({
        ...col,
        cards: col.cards.filter((c) => c.id !== cardId),
      })),
    }),
  );
}

export function useToggleChecklistItem(boardId: string) {
  return useOptimistic<string>(
    boardId,
    toggleChecklistItem,
    (old, itemId) => ({
      ...old,
      columns: old.columns.map((col) => ({
        ...col,
        cards: col.cards.map((c) => ({
          ...c,
          checklist: c.checklist.map((item) =>
            item.id === itemId ? { ...item, completed: !item.completed } : item,
          ),
        })),
      })),
    }),
  );
}

export function useAddChecklistItem(boardId: string) {
  return useOptimistic<{ cardId: string; text: string }>(
    boardId,
    ({ cardId, text }) => addChecklistItem(cardId, text),
    (old, { cardId, text }) => {
      const card = old.columns.flatMap((c) => c.cards).find((c) => c.id === cardId);
      const maxPos = card
        ? card.checklist.reduce((m, i) => Math.max(m, i.position), 0)
        : 0;
      return patchCard(old, cardId, (c) => ({
        ...c,
        checklist: [
          ...c.checklist,
          {
            id: `opt-item-${Date.now()}`,
            cardId,
            text,
            completed: false,
            position: maxPos + 1,
            createdAt: new Date().toISOString(),
          },
        ],
      }));
    },
  );
}
