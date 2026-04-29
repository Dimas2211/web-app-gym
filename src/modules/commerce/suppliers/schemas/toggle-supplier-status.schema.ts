// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — toggle-supplier-status.schema.ts
//
// Validador Zod para activar o inactivar un proveedor.
// Operación acotada: solo cambia status.
// Cualquier otra modificación va por update-supplier.schema.
//
// Regla de negocio: un proveedor inactivo no puede seleccionarse
// en nuevas compras. La validación de compras activas ligadas al
// proveedor se resuelve en el service, no aquí.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

export const supplierStatusEnum = z.enum(["active", "inactive"], {
  errorMap: () => ({
    message: "El estado debe ser 'active' o 'inactive'.",
  }),
});

export const toggleSupplierStatusSchema = z.object({
  id: z
    .string({ required_error: "El ID del proveedor es requerido." })
    .uuid("El ID del proveedor no es válido."),

  status: supplierStatusEnum,
});

export type ToggleSupplierStatusInput = z.infer<typeof toggleSupplierStatusSchema>;
