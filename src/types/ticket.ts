export type TicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type TicketSource = "MANUAL" | "HEALTH_ALERT" | "WEBHOOK" | "EMAIL" | "POS";

export interface Ticket {
  id: string;
  tenantId: string;
  clientId?: string;
  branchId?: string;
  title: string;
  description?: string;
  priority: TicketPriority;
  status: TicketStatus;
  source: TicketSource;
  sourceRefId?: string;
  assigneeId?: string;
  labels: string[];
  commentsCount: number;
  estimatedMinutes?: number;
  slaDueAt?: string;
  slaBreached?: boolean;
  posContext?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface TicketComment {
  id: string;
  authorId?: string;
  authorName?: string;
  content: string;
  internal: boolean;
  senderType: string;
  createdAt: string;
}

export interface TicketListParams {
  status?: TicketStatus;
  priority?: TicketPriority;
  source?: TicketSource;
  assigneeId?: string;
  clientId?: string;
  slaAtRisk?: boolean;
  q?: string;
  page?: number;
  size?: number;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
  first: boolean;
  last: boolean;
}

export interface TicketStats {
  total: number;
  byStatus: Partial<Record<TicketStatus, number>>;
}
