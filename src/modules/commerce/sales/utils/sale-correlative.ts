// ─────────────────────────────────────────────────────────────────
// commerce/sales — sale-correlative.ts
//
// Generación del correlativo interno de venta por location + mes + año.
// Independiente del correlativo DTE (DteCorrelative).
//
// La unicidad final está garantizada por la constraint de base de datos:
//   @@unique([tenant_id, location_id, sale_year, sale_month, sale_sequence])
// ante colisiones concurrentes, Prisma lanza P2002 — el llamador debe reintentar.
// ─────────────────────────────────────────────────────────────────

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/** Extrae { year, month } de un string YYYY-MM-DD o de un Date. */
export function extractSaleDateParts(
  date: Date | string,
): { year: number; month: number } {
  const d = typeof date === "string" ? new Date(date + "T00:00:00") : date;
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * Calcula el siguiente sale_sequence disponible para una location en un año/mes.
 *
 * No garantiza atomicidad; la constraint de BD protege ante concurrencia.
 * Debe llamarse dentro de una transacción cuando sea posible.
 */
export async function getNextSaleSequence(
  tx:          Prisma.TransactionClient | typeof prisma,
  tenant_id:   string,
  location_id: string,
  year:        number,
  month:       number,
): Promise<number> {
  const result = await (tx as typeof prisma).$queryRaw<[{ max_seq: number | null }]>`
    SELECT MAX("sale_sequence") AS max_seq
    FROM   "sales"
    WHERE  "tenant_id"   = ${tenant_id}
      AND  "location_id" = ${location_id}
      AND  "sale_year"   = ${year}
      AND  "sale_month"  = ${month}
  `;
  return (Number(result[0]?.max_seq) || 0) + 1;
}

/**
 * Construye el sale_code a partir de location, año, mes y secuencia.
 * Ejemplo: "VTA-2026-01-0042"
 */
export function buildSaleCode(
  year:     number,
  month:    number,
  sequence: number,
): string {
  const mm  = String(month).padStart(2, "0");
  const seq = String(sequence).padStart(4, "0");
  return `VTA-${year}-${mm}-${seq}`;
}
