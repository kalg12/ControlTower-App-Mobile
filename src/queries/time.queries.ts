import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  startTimer,
  stopTimer,
  logTime,
  getActiveEntry,
  getTimeSummary,
} from "@/api/time.api";
import { TimeEntityType } from "@/types/time";

export const timeKeys = {
  all: ["time"] as const,
  active: () => ["time", "active"] as const,
  summary: (entityType: TimeEntityType, entityId: string) =>
    ["time", "summary", entityType, entityId] as const,
};

export function useActiveEntry() {
  return useQuery({
    queryKey: timeKeys.active(),
    queryFn: getActiveEntry,
    refetchInterval: 10_000,
  });
}

export function useTimeSummary(entityType: TimeEntityType, entityId: string) {
  return useQuery({
    queryKey: timeKeys.summary(entityType, entityId),
    queryFn: () => getTimeSummary(entityType, entityId),
    enabled: !!entityId,
  });
}

export function useStartTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entityType, entityId }: { entityType: TimeEntityType; entityId: string }) =>
      startTimer(entityType, entityId),
    onSuccess: () => qc.invalidateQueries({ queryKey: timeKeys.all }),
  });
}

export function useStopTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => stopTimer(entryId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: timeKeys.all });
      qc.invalidateQueries({
        queryKey: timeKeys.summary(data.entityType, data.entityId),
      });
    },
  });
}

export function useLogTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      entityType,
      entityId,
      minutes,
      note,
    }: {
      entityType: TimeEntityType;
      entityId: string;
      minutes: number;
      note?: string;
    }) => logTime(entityType, entityId, minutes, note),
    onSuccess: (data) => {
      qc.invalidateQueries({
        queryKey: timeKeys.summary(data.entityType, data.entityId),
      });
    },
  });
}
