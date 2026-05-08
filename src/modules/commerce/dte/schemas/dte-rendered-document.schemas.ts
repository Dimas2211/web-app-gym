// commerce/dte — dte-rendered-document.schemas.ts

import { z } from "zod";

export const DteRenderedDocumentStatusSchema = z.enum(["PENDING", "GENERATED", "FAILED"]);

export const CreateDteRenderedDocumentSchema = z.object({
  dte_document_id: z.string().uuid(),
  format:          z.string().min(1).max(20),
  storage_key:     z.string().optional(),
  public_url:      z.string().url().optional(),
  file_name:       z.string().optional(),
  mime_type:       z.string().optional(),
  file_size:       z.number().int().positive().optional(),
});

export type CreateDteRenderedDocumentInput = z.infer<typeof CreateDteRenderedDocumentSchema>;
