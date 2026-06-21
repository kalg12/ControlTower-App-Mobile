export interface ResponseTemplate {
  id: string;
  tenantId: string;
  authorId: string;
  name: string;
  body: string;
  category?: string;
  shortcut?: string;
}

export interface CreateTemplatePayload {
  name: string;
  body: string;
  category?: string;
  shortcut?: string;
}
