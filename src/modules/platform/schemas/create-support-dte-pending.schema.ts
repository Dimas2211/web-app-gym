// ─────────────────────────────────────────────────────────────────
// platform/schemas — create-support-dte-pending.schema.ts
//
// F2-B1: Validación de entrada para crear DTE pendiente desde
// Support Session. Zod solo valida forma/tipo — las reglas de
// negocio (sale confirmada, cliente fiscal, correlativo, etc.)
// viven en el runner.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

export const createSupportDtePendingSchema = z.object({
  profileId:             z.string().min(1, "profileId requerido"),
  mode:                  z.enum(["DRY_RUN", "EXECUTE"]),
  sale_id:               z.string().min(1, "sale_id requerido"),
  dte_type_code:         z.enum(["01", "03"]),
  confirmationText:      z.string().optional(),
  hasBackupConfirmation: z.boolean().optional(),
  hasDryRunConfirmation: z.boolean().optional(),
});

export type CreateSupportDtePendingSchemaInput = z.infer<typeof createSupportDtePendingSchema>;
