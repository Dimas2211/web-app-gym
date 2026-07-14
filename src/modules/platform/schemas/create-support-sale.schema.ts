// ─────────────────────────────────────────────────────────────────
// platform/schemas — create-support-sale.schema.ts
//
// F1-B1: Validación de entrada para crear venta de prueba desde
// Support Session. Zod solo valida forma/tipo — las reglas de
// negocio (tenant, stock, producto activo, etc.) viven en el runner.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

export const createSupportSaleItemSchema = z.object({
  product_id: z.string().uuid("product_id debe ser un UUID válido"),
  quantity: z
    .number({ invalid_type_error: "La cantidad debe ser numérica" })
    .positive("La cantidad debe ser mayor que cero")
    .max(99999, "Cantidad fuera de rango"),
  unit_price: z
    .number({ invalid_type_error: "El precio debe ser numérico" })
    .nonnegative("El precio no puede ser negativo")
    .max(9999999, "Precio fuera de rango"),
  notes: z.string().trim().max(300).optional().nullable(),
});

export const createSupportSaleSchema = z.object({
  profileId:   z.string().min(1, "profileId requerido"),
  mode:        z.enum(["DRY_RUN", "EXECUTE"]),
  location_id: z.string().min(1, "location_id requerido"),
  customer_id: z.string().uuid("customer_id debe ser un UUID válido").optional().nullable(),
  primary_dte_type_code: z.enum(["01", "03"]),
  items: z.array(createSupportSaleItemSchema).min(1, "Debe agregar al menos una línea."),
  payment_method_code: z.string().trim().max(10).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  confirmationText: z.string().optional(),
  hasBackupConfirmation: z.boolean().optional(),
  hasDryRunConfirmation: z.boolean().optional(),
});

export type CreateSupportSaleSchemaInput = z.infer<typeof createSupportSaleSchema>;
