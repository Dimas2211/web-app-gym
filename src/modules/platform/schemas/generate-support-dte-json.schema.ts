// ─────────────────────────────────────────────────────────────────
// platform/schemas — generate-support-dte-json.schema.ts
//
// F2-B1: Validación de entrada para generar JSON DTE + validar
// schema AJV desde Support Session, en el mismo paso.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

export const generateSupportDteJsonSchema = z.object({
  profileId:             z.string().min(1, "profileId requerido"),
  dte_document_id:       z.string().min(1, "dte_document_id requerido"),
  confirmationText:      z.string().optional(),
  hasBackupConfirmation: z.boolean().optional(),
});

export type GenerateSupportDteJsonSchemaInput = z.infer<typeof generateSupportDteJsonSchema>;
