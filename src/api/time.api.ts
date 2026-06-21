import { apiClient } from "./client";
import { TimeEntry, TimeSummary, TimeEntityType } from "@/types/time";

export async function startTimer(entityType: TimeEntityType, entityId: string): Promise<TimeEntry> {
  const res = await apiClient.post("/api/v1/time-entries/start", { entityType, entityId });
  return res.data;
}

export async function stopTimer(entryId: string): Promise<TimeEntry> {
  const res = await apiClient.patch(`/api/v1/time-entries/${entryId}/stop`);
  return res.data;
}

export async function logTime(
  entityType: TimeEntityType,
  entityId: string,
  minutes: number,
  note?: string,
): Promise<TimeEntry> {
  const res = await apiClient.post("/api/v1/time-entries/log", {
    entityType,
    entityId,
    minutes,
    note,
  });
  return res.data;
}

export async function getActiveEntry(): Promise<TimeEntry | null> {
  const res = await apiClient.get("/api/v1/time-entries/active");
  return res.data ?? null;
}

export async function getTimeSummary(
  entityType: TimeEntityType,
  entityId: string,
): Promise<TimeSummary> {
  const res = await apiClient.get("/api/v1/time-entries/summary", {
    params: { entityType, entityId },
  });
  return res.data;
}
