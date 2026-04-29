// ─────────────────────────────────────────────────────────────────
// commerce/purchases — get-next-purchase-code.ts
//
// Calcula el siguiente correlativo numérico disponible para una
// location en un año/mes determinado.
//
// Usa MAX(CAST(purchase_code AS INTEGER)) filtrando solo códigos
// estrictamente numéricos — ignora cualquier código legado no
// numérico que pudiera existir.
//
// No garantiza atomicidad: la unicidad final la impone el
// constraint @@unique([location_id, year, month, purchase_code])
// en la base de datos (P2002 en caso de colisión concurrente).
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";

export async function getNextPurchaseCode(
  location_id: string,
  year:        number,
  month:       number,
): Promise<number> {
  const result = await prisma.$queryRaw<[{ max_code: number | null }]>`
    SELECT MAX(CAST("purchase_code" AS INTEGER)) AS max_code
    FROM   "purchases"
    WHERE  "location_id"    = ${location_id}
      AND  "purchase_year"  = ${year}
      AND  "purchase_month" = ${month}
      AND  "purchase_code"  ~ '^[0-9]+$'
  `;

  return (Number(result[0]?.max_code) || 0) + 1;
}
