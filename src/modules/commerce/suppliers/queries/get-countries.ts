// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — get-countries.ts
//
// Catálogo de países — ISO 3166-1 alpha-2.
// Usado en el selector de país de la pestaña Dirección del proveedor.
//
// La selección de una fila llena country_code + country_name.
//
// Sin filtros de búsqueda en esta query: el catálogo es pequeño
// (≤50 registros activos) y se carga completo para el selector.
// El filtrado por texto se hace en cliente dentro del componente Select.
//
// Solo se devuelven registros con status=active.
// Sin tenant_id — catálogo de sistema global.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { CountryItem } from "../types/supplier-catalogs.types";

/**
 * Devuelve todos los países activos del catálogo, ordenados por nombre.
 * Sin paginación — el catálogo es lo suficientemente pequeño para cargarse completo.
 */
export async function getCountries(): Promise<CountryItem[]> {
  const rows = await prisma.country.findMany({
    where:   { status: "active" },
    select:  { code: true, name: true },
    orderBy: { name: "asc" },
  });

  return rows.map((row) => ({
    code: row.code,
    name: row.name,
  }));
}
