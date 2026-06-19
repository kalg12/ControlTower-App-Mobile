export type TicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type TicketSource = "MANUAL" | "HEALTH_ALERT" | "WEBHOOK" | "EMAIL" | "POS";

export interface Ticket {
  id: string;
  tenantId: string;
  title: string;
  description?: string;
  priority: TicketPriority;
  status: TicketStatus;
  source: TicketSource;
  assigneeId?: string;
  requesterEmail?: string;
  departmentId?: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  authorId?: string;
  content: string;
  internal: boolean;
  source: "AGENT" | "EMAIL" | "SYSTEM";
  createdAt: string;
}

export interface TicketListParams {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string;
  page?: number;
  size?: number;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  pageNumber: number;
  pageSize: number;
  last: boolean;
}
