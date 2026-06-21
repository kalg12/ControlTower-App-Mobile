export type TimeEntityType = "TICKET" | "CARD";

export interface TimeEntry {
  id: string;
  userId: string;
  entityType: TimeEntityType;
  entityId: string;
  startedAt: string;
  endedAt?: string;
  minutes?: number;
  note?: string;
  active: boolean;
  createdAt: string;
}

export interface TimeSummary {
  entityId: string;
  entityType: TimeEntityType;
  estimatedMinutes?: number;
  loggedMinutes: number;
  entries: TimeEntry[];
}

export interface TicketAttachment {
  id: string;
  ticketId: string;
  uploadedBy: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: string;
}
