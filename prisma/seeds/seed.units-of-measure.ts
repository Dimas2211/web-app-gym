/**
 * seed.units-of-measure.ts
 *
 * Catálogo global de unidades de medida — sin tenant_id.
 * Fuente: CAT-014 del Sistema de Transmisión del Ministerio de Hacienda de El Salvador
 * (prisma/seeds/data/cat014-units.ts — fuente única compartida con el flujo comercial
 * de FEX 11, ver F3-C23E).
 *
 * F3-C23E: UnitOfMeasure.mh_unit_code ya existe en el schema (migración previa a
 * esta microfase — sin cambios de schema aquí). Este seed ahora sí lo puebla:
 * antes solo dejaba una nota de "pendiente" porque el campo no existía todavía.
 * Reejecutar este seed sobre unidades ya creadas por FE/CCFE (p. ej. "und") backfillea
 * mh_unit_code sin tocar name/symbol.
 *
 * Idempotente: puede ejecutarse múltiples veces sin duplicar datos.
 * Clave de upsert: symbol (@@unique en el schema).
 */

import { PrismaClient } from "@prisma/client";
import { CAT014_UNITS } from "./data/cat014-units";

export async function seedUnitsOfMeasure(prisma: PrismaClient): Promise<void> {
  console.log("\n📐 Unidades de medida (CAT-014 Hacienda El Salvador)...");

  let created = 0;
  let updated = 0;
  let mhBackfilled = 0;

  for (const unit of CAT014_UNITS) {
    const mh_unit_code = String(unit.mh_code);

    const before = await prisma.unitOfMeasure.findUnique({
      where:  { symbol: unit.symbol },
      select: { mh_unit_code: true },
    });

    const result = await prisma.unitOfMeasure.upsert({
      where:  { symbol: unit.symbol },
      update: { name: unit.name, mh_unit_code },
      create: { name: unit.name, symbol: unit.symbol, status: "active", mh_unit_code },
    });

    const isNew = result.created_at.getTime() === result.updated_at.getTime();
    if (isNew) { created++; } else { updated++; }
    if (!before || before.mh_unit_code !== mh_unit_code) mhBackfilled++;
  }

  console.log(`  ✅ ${CAT014_UNITS.length} unidades procesadas — creadas: ${created}, ya existían: ${updated}, mh_unit_code asignado/actualizado: ${mhBackfilled}`);
}
