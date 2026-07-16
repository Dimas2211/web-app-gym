// ─────────────────────────────────────────────────────────────────
// platform/schemas — sign-support-dte.schema.ts
//
// F2-B2: Validación de entrada para firmar un DteOutgoingDocument
// SCHEMA_VALIDATED desde Support Session. Zod solo valida forma/tipo —
// las reglas de negocio (estado, tipo DTE, venta confirmada, etc.)
// viven en el runner.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

export const signSupportDteSchema = z.object({
  profileId:             z.string().min(1, "profileId requerido"),
  mode:                  z.enum(["DRY_RUN", "EXECUTE"]),
  dte_document_id:       z.string().min(1, "dte_document_id requerido"),
  confirmationText:      z.string().optional(),
  hasBackupConfirmation: z.boolean().optional(),
  hasDryRunConfirmation: z.boolean().optional(),
});

export type SignSupportDteSchemaInput = z.infer<typeof signSupportDteSchema>;
