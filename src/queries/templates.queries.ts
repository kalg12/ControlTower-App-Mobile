import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "@/api/templates.api";
import { CreateTemplatePayload } from "@/types/templates";

export const templateKeys = {
  all: ["templates"] as const,
  list: (q?: string, category?: string) => ["templates", "list", q, category] as const,
};

export function useTemplates(q?: string, category?: string) {
  return useQuery({
    queryKey: templateKeys.list(q, category),
    queryFn: () => getTemplates(q, category),
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateTemplatePayload) => createTemplate(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.all }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CreateTemplatePayload }) =>
      updateTemplate(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.all }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.all }),
  });
}
