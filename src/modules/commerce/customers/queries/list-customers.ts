// ─────────────────────────────────────────────────────────────────
// commerce/customers — list-customers.ts
// ─────────────────────────────────────────────────────────────────

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CustomerFilters } from "../schemas/customer.schemas";
import type { CustomerListItem } from "../types/customer.types";

export interface CustomersPage {
  items: CustomerListItem[];
  total: number;
}

/**
 * @param filters - Filtros, ordenamiento y paginación.
 * @param client  - Cliente Prisma a usar. Por defecto el Prisma global de la
 *                  app. Los callers runtime-aware (PASO 4 — Plataforma
 *                  Multiindustria) pueden pasar un PrismaClient resuelto vía
 *                  withRuntimePrisma para leer una base cliente distinta.
 *                  Nunca cambia el comportamiento de los callers existentes.
 */
export async function listCustomers(
  filters: CustomerFilters,
  client: PrismaClient = prisma,
): Promise<CustomersPage> {
  const {
    tenant_id,
    status,
    taxpayer_type,
    search,
    sort_field     = "customer_code",
    sort_direction = "asc",
    page      = 1,
    page_size = 25,
  } = filters;

  const where: Prisma.CustomerWhereInput = {
    tenant_id,
    ...(status        && { status }),
    ...(taxpayer_type && { taxpayer_type }),
    ...(search && {
      OR: [
        { name:          { contains: search, mode: "insensitive" } },
        { customer_code: { contains: search, mode: "insensitive" } },
        { nit:           { contains: search, mode: "insensitive" } },
        { nrc:           { contains: search, mode: "insensitive" } },
        { dui:           { contains: search, mode: "insensitive" } },
        { email:         { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const orderByMap: Record<string, Prisma.CustomerOrderByWithRelationInput> = {
    customer_code: { customer_code: sort_direction },
    name:          { name:          sort_direction },
    created_at:    { created_at:    sort_direction },
  };
  const orderBy = orderByMap[sort_field] ?? { customer_code: "asc" };

  const skip = (page - 1) * page_size;

  const [rows, total] = await Promise.all([
    client.customer.findMany({
      where,
      orderBy,
      skip,
      take: page_size,
      select: {
        id:            true,
        tenant_id:     true,
        customer_code: true,
        name:          true,
        legal_name:    true,
        taxpayer_type: true,
        nit:           true,
        nrc:           true,
        dui:           true,
        email:         true,
        phone:         true,
        status:        true,
        created_at:    true,
      },
    }),
    client.customer.count({ where }),
  ]);

  const items: CustomerListItem[] = rows.map((r) => ({
    id:            r.id,
    tenant_id:     r.tenant_id,
    customer_code: r.customer_code,
    name:          r.name,
    legal_name:    r.legal_name,
    taxpayer_type: r.taxpayer_type as CustomerListItem["taxpayer_type"],
    nit:           r.nit,
    nrc:           r.nrc,
    dui:           r.dui,
    email:         r.email,
    phone:         r.phone,
    status:        r.status as CustomerListItem["status"],
    created_at:    r.created_at,
  }));

  return { items, total };
}
