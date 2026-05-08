// commerce/dte — dte-document-relation.types.ts

export type DteDocumentRelationType =
  | "CREDIT_NOTE_OF"
  | "DEBIT_NOTE_OF"
  | "REPLACES"
  | "REFERENCES";

export interface DteDocumentRelationDetail {
  id:                      string;
  tenant_id:               string;
  location_id:             string;
  source_dte_document_id:  string;
  related_dte_document_id: string;
  relation_type:           DteDocumentRelationType;
  reason_code:             string | null;
  reason_text:             string | null;
  amount:                  string | null; // Decimal serializado
  created_by:              string | null;
  created_at:              Date;
}
