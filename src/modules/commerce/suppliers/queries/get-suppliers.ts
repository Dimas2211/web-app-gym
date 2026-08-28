// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — get-suppliers.ts
//
// Lista filtrada del maestro de proveedores de un tenant.
// Patrón scroll con límite alto — no hay paginación visual clásica.
//
// Filtros soportados:
//   search_code  → contains insensible sobre supplier_code
//   search_name  → contains insensible sobre name
//   taxpayer_type → igualdad exacta
//   status        → igualdad exacta
//
// Ordenamientos soportados: todos los campos de SupplierSortField.
//
// Ejecuta count y findMany en la misma transacción para consistencia.
// No hay Decimal en Supplier — el mapper es 1:1 sin conversiones.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import type { SupplierListItem } from "../types/supplier.types";
import type {
  SupplierFilters,
  SupplierListResult,
  SupplierSort,
} from "../types/supplier-filters.types";

// ── Constantes de paginación ──────────────────────────────────────

const DEFAULT_PAGE_SIZE = 150;
// 500 cubre catálogos operativos grandes sin necesitar paginación clásica.
const MAX_PAGE_SIZE = 500;

// ── Select reutilizable para la lista ────────────────────────────

/**
 * Proyección de columnas para la grilla principal.
 * Exportado para reutilizarse en otros lugares si se necesita
 * la misma proyección sin ejecutar la query completa.
 */
export const SUPPLIER_LIST_SELECT = {
  id:            true,
  tenant_id:     true,
  supplier_code: true,
  account_code:  true,
  name:          true,
  legal_name:    true,
  taxpayer_type: true,
  person_type:   true,
  id_type_code:  true,
  dui:           true,
  nit:           true,
  nrc:           true,
  phone:         true,
  status:        true,
  created_at:    true,
} as const;

// ── Helpers ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildOrderBy(sort?: SupplierSort): any {
  const d = sort?.direction ?? "asc";
  const field = sort?.field ?? "name";
  // Todos los sorts son simples en la grilla de proveedores.
  return { [field]: d };
}

function buildWhere(filters: SupplierFilters) {
  return {
    tenant_id: filters.tenant_id,

    ...(filters.search_code?.trim() && {
      supplier_code: {
        contains: filters.search_code.trim(),
        mode: "insensitive" as const,
      },
    }),
    ...(filters.search_name?.trim() && {
      name: {
        contains: filters.search_name.trim(),
        mode: "insensitive" as const,
      },
    }),

    ...(filters.taxpayer_type && { taxpayer_type: filters.taxpayer_type }),
    ...(filters.status        && { status: filters.status }),
  };
}

// ── Query principal ───────────────────────────────────────────────

/**
 * Devuelve la lista de proveedores del tenant con filtros y ordenamiento.
 * Patrón scroll: sin page, carga hasta page_size en un solo resultado.
 *
 * @param filters - Incluye tenant_id (requerido) + filtros opcionales.
 * @param client  - Cliente Prisma a usar. Por defecto el Prisma global de la
 *                  app. Los callers runtime-aware (PASO 4 — Plataforma
 *                  Multiindustria) pueden pasar un PrismaClient resuelto vía
 *                  withRuntimePrisma para leer una base cliente distinta.
 *                  Nunca cambia el comportamiento de los callers existentes.
 */
export async function getSuppliers(
  filters: SupplierFilters,
  client: PrismaClient = prisma,
): Promise<SupplierListResult<SupplierListItem>> {
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, filters.page_size ?? DEFAULT_PAGE_SIZE),
  );

  const sort: SupplierSort | undefined =
    filters.sort_field
      ? { field: filters.sort_field, direction: filters.sort_direction ?? "asc" }
      : undefined;

  const where = buildWhere(filters);

  const [rows, total] = await client.$transaction([
    client.supplier.findMany({
      where,
      select: SUPPLIER_LIST_SELECT,
      orderBy: buildOrderBy(sort),
      take: pageSize,
    }),
    client.supplier.count({ where }),
  ]);

  const items: SupplierListItem[] = rows.map((row) => ({
    id:            row.id,
    tenant_id:     row.tenant_id,
    supplier_code: row.supplier_code,
    account_code:  row.account_code,
    name:          row.name,
    legal_name:    row.legal_name,
    taxpayer_type: row.taxpayer_type as SupplierListItem["taxpayer_type"],
    person_type:   row.person_type   as SupplierListItem["person_type"],
    id_type_code:  row.id_type_code,
    dui:           row.dui,
    nit:           row.nit,
    nrc:           row.nrc,
    phone:         row.phone,
    status:        row.status as SupplierListItem["status"],
    created_at:    row.created_at,
  }));

  return {
    items,
    total,
    page:       1,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
