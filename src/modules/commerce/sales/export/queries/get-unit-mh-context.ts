// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — get-unit-mh-context.ts
//
// F3-C23E — Contexto de una UnitOfMeasure antes de asignarle un
// código MH (CAT-014) desde el flujo comercial de FEX 11. Expone
// cuántos productos del tenant comparten esa unidad, para que el
// modal de configuración advierta al usuario antes de confirmar (la
// unidad es un catálogo global compartido, no exclusiva de un
// producto — ver UnitOfMeasure en schema.prisma).
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";

export interface UnitMhContext {
  unit_id:              string;
  unit_name:            string;
  unit_symbol:          string;
  mh_unit_code:         string | null;
  shared_product_count: number;
}

export async function getUnitMhContext(tenant_id: string, unit_id: string): Promise<UnitMhContext | null> {
  const unit = await prisma.unitOfMeasure.findUnique({
    where:  { id: unit_id },
    select: { id: true, name: true, symbol: true, mh_unit_code: true },
  });
  if (!unit) return null;

  const shared_product_count = await prisma.product.count({
    where: { tenant_id, unit_id },
  });

  return {
    unit_id:              unit.id,
    unit_name:            unit.name,
    unit_symbol:          unit.symbol,
    mh_unit_code:         unit.mh_unit_code,
    shared_product_count,
  };
}
