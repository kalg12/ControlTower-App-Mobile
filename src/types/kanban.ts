export type BoardVisibility = "PRIVATE" | "TEAM";
export type CardPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ChecklistItem {
  id: string;
  cardId: string;
  text: string;
  completed: boolean;
  position: number;
  createdAt: string;
}

export interface KanbanCard {
  id: string;
  columnId: string;
  title: string;
  description?: string;
  assigneeIds: string[];
  dueDate?: string;
  priority?: CardPriority;
  position: number;
  labels: string[];
  checklist: ChecklistItem[];
  estimatedMinutes?: number;
  attendedBy?: string;
  attendedAt?: string;
  wasOverdue?: boolean;
  clientId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KanbanColumn {
  id: string;
  boardId: string;
  name: string;
  columnKind: string;
  position: number;
  wipLimit?: number;
  cards: KanbanCard[];
  createdAt: string;
}

export interface Board {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  visibility: BoardVisibility;
  createdBy?: string;
  clientId?: string;
  createdAt: string;
  updatedAt: string;
  columns: KanbanColumn[];
}

export interface CreateBoardPayload {
  name: string;
  description?: string;
  visibility: BoardVisibility;
  clientId?: string;
}

export interface CreateCardPayload {
  columnId: string;
  title: string;
  description?: string;
  assigneeIds?: string[];
  dueDate?: string;
  priority?: CardPriority;
  position?: number;
  estimatedMinutes?: number;
  clientId?: string;
}

export interface UpdateCardPayload {
  title: string;
  description?: string;
  assigneeIds?: string[];
  dueDate?: string;
  priority: CardPriority;
  estimatedMinutes?: number;
  clientId?: string;
}

export interface MoveCardPayload {
  targetColumnId: string;
  position?: number;
  notifyByEmail?: boolean;
}
