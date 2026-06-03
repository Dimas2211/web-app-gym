// ─────────────────────────────────────────────────────────────────
// platform — change-organization-status.schema.ts
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

export const changeOrganizationStatusSchema = z.object({
  id:     z.string().uuid("ID de organización inválido."),
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "CANCELLED"]),
  reason: z.string().max(500).trim().nullable().optional(),
});

export type ChangeOrganizationStatusInput = z.infer<typeof changeOrganizationStatusSchema>;
