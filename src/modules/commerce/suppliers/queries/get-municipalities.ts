// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — get-municipalities.ts
//
// Catálogo CAT-013 — Municipios de El Salvador.
// Usados en la pestaña Dirección del proveedor.
//
// La selección de una fila llena:
//   dept_code + dept_name + municipality_code + municipality_name
//
// Filtros:
//   search    → contains insensible en name (municipio) y dept_name
//   dept_code → igualdad exacta: carga todos los municipios de un depto
//   limit     → por defecto 100, máximo 300
//
// Cuando dept_code está presente y search está vacío, devuelve todos
// los municipios del departamento (≤32 registros) — útil para UI tipo
// cascada depto → municipio.
//
// Solo se devuelven registros con status=active.
// Sin tenant_id — catálogo de sistema global.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type {
  MunicipalityItem,
  MunicipalitySearchParams,
} from "../types/supplier-catalogs.types";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT     = 300;

/**
 * Busca municipios del catálogo CAT-013.
 *
 * @param params - Filtros opcionales: search, dept_code, limit.
 */
export async function getMunicipalities(
  params: MunicipalitySearchParams = {},
): Promise<MunicipalityItem[]> {
  const { search, dept_code, limit } = params;
  const term = search?.trim();
  const take = Math.min(MAX_LIMIT, Math.max(1, limit ?? DEFAULT_LIMIT));

  const rows = await prisma.municipality.findMany({
    where: {
      status: "active",
      ...(dept_code && { dept_code }),
      ...(term && {
        OR: [
          { name:      { contains: term, mode: "insensitive" } },
          { dept_name: { contains: term, mode: "insensitive" } },
        ],
      }),
    },
    select: {
      id:        true,
      dept_code: true,
      dept_name: true,
      code:      true,
      name:      true,
    },
    // Orden: departamento primero, luego nombre de municipio dentro del depto.
    orderBy: [{ dept_code: "asc" }, { name: "asc" }],
    take,
  });

  return rows.map((row) => ({
    id:        row.id,
    dept_code: row.dept_code,
    dept_name: row.dept_name,
    code:      row.code,
    name:      row.name,
  }));
}
