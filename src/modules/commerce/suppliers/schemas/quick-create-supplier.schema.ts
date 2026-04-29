// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — quick-create-supplier.schema.ts
//
// Validador Zod para el alta rápida de proveedor desde el flujo
// de compras, sin salir del documento de compra.
//
// Solo 2 campos del usuario: name y taxpayer_type.
// supplier_code se genera automáticamente en el service
// con el patrón PROV-{slug}-{random4} para no interrumpir
// el flujo de compra con burocracia de codificación.
//
// El proveedor creado queda activo y puede completarse luego
// desde el maestro de proveedores.
//
// Sin superRefine: no hay pares de catálogo en el alta rápida.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";
import { taxpayerTypeEnum } from "./create-supplier.schema";

export const quickCreateSupplierSchema = z.object({
  name: z
    .string({ required_error: "El nombre del proveedor es requerido." })
    .min(1, "El nombre del proveedor es requerido.")
    .max(200, "El nombre no puede superar los 200 caracteres.")
    .trim(),

  taxpayer_type: taxpayerTypeEnum,
});

export type QuickCreateSupplierInput = z.infer<typeof quickCreateSupplierSchema>;
