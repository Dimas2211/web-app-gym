// commerce/dte — dte-document-relation.schemas.ts

import { z } from "zod";

export const DteDocumentRelationTypeSchema = z.enum([
  "CREDIT_NOTE_OF",
  "DEBIT_NOTE_OF",
  "REPLACES",
  "REFERENCES",
]);

export const CreateDteDocumentRelationSchema = z.object({
  source_dte_document_id:  z.string().uuid(),
  related_dte_document_id: z.string().uuid(),
  relation_type:           DteDocumentRelationTypeSchema,
  reason_code:             z.string().max(10).optional(),
  reason_text:             z.string().max(500).optional(),
  amount:                  z.number().positive().optional(),
});

export type CreateDteDocumentRelationInput = z.infer<typeof CreateDteDocumentRelationSchema>;
