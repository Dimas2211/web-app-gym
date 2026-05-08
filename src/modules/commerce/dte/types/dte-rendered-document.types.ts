// commerce/dte — dte-rendered-document.types.ts

export type DteRenderedDocumentStatus = "PENDING" | "GENERATED" | "FAILED";

export interface DteRenderedDocumentDetail {
  id:              string;
  tenant_id:       string;
  location_id:     string;
  dte_document_id: string;
  format:          string;
  storage_key:     string | null;
  public_url:      string | null;
  file_name:       string | null;
  mime_type:       string | null;
  file_size:       number | null;
  status:          DteRenderedDocumentStatus;
  generated_at:    Date | null;
  generated_by:    string | null;
  error_message:   string | null;
  created_at:      Date;
  updated_at:      Date;
}
