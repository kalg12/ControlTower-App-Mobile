import { apiClient } from "./client";
import { ResponseTemplate, CreateTemplatePayload } from "@/types/templates";

export async function getTemplates(q?: string, category?: string): Promise<ResponseTemplate[]> {
  const res = await apiClient.get("/api/v1/templates", {
    params: { q, category, size: 100 },
  });
  const data = res.data;
  return (data?.content ?? data ?? []) as ResponseTemplate[];
}

export async function createTemplate(payload: CreateTemplatePayload): Promise<ResponseTemplate> {
  const res = await apiClient.post("/api/v1/templates", payload);
  return res.data;
}

export async function updateTemplate(id: string, payload: CreateTemplatePayload): Promise<ResponseTemplate> {
  const res = await apiClient.put(`/api/v1/templates/${id}`, payload);
  return res.data;
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/templates/${id}`);
}
