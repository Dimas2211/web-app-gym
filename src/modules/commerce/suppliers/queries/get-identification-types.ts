// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — get-identification-types.ts
//
// Catálogo CAT-022 — Tipos de identificación DTE El Salvador.
// Usados en el selector de tipo de documento de la ficha del proveedor.
//
// El catálogo es de sistema (sin tenant_id), cargado por seed,
// no editable desde la UI de suppliers.
//
// Solo se devuelven los registros con status=active.
// Ordenados por code ascendente (orden natural del catálogo DTE).
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { IdentificationTypeItem } from "../types/supplier-catalogs.types";

/**
 * Devuelve todos los tipos de identificación activos del catálogo CAT-022.
 * Sin filtros adicionales — el catálogo es pequeño (≤10 registros).
 */
export async function getIdentificationTypes(): Promise<IdentificationTypeItem[]> {
  const rows = await prisma.identificationType.findMany({
    where:   { status: "active" },
    select:  { code: true, name: true, description: true },
    orderBy: { code: "asc" },
  });

  return rows.map((row) => ({
    code:        row.code,
    name:        row.name,
    description: row.description,
  }));
}
