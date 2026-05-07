// ─────────────────────────────────────────────────────────────────
// commerce/purchases — get-purchase-dte-import-by-id.ts
//
// Consulta de un registro PurchaseDteImport por id.
// Valida tenant_id y location_id para evitar acceso cruzado.
// Devuelve null si no existe o no pertenece al contexto activo.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PurchaseDteImportRecord } from "../types/purchase-dte-import.types";

export async function getPurchaseDteImportById(
  id:          string,
  tenant_id:   string,
  location_id: string,
): Promise<PurchaseDteImportRecord | null> {
  const record = await prisma.purchaseDteImport.findFirst({
    where: { id, tenant_id, location_id },
    select: {
      id:               true,
      tenant_id:        true,
      location_id:      true,
      status:           true,
      dte_type:         true,
      generation_code:  true,
      control_number:   true,
      environment_code: true,
      issuer_nit:       true,
      issuer_nrc:       true,
      issuer_name:      true,
      issued_at:        true,
      subtotal:         true,
      tax_amount:       true,
      total_amount:     true,
      item_count:       true,
      reception_stamp:  true,
      purchase_id:      true,
      raw_json:         true,
      created_at:       true,
      updated_at:       true,
      created_by:       true,
    },
  });

  if (!record) return null;

  return {
    ...record,
    subtotal:     record.subtotal     !== null ? Number(record.subtotal)     : null,
    tax_amount:   record.tax_amount   !== null ? Number(record.tax_amount)   : null,
    total_amount: record.total_amount !== null ? Number(record.total_amount) : null,
  };
}
