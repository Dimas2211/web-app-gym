// ─────────────────────────────────────────────────────────────────
// commerce/customers — search-customers-for-sale.ts
//
// Búsqueda rápida de clientes para selector en formulario de venta.
// Devuelve solo los campos necesarios para el lookup.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import type { CustomerForSaleLookup } from "../types/customer.types";

export async function searchCustomersForSale(
  tenant_id: string,
  search:    string,
  limit      = 20,
  client: PrismaClient = prisma,
): Promise<CustomerForSaleLookup[]> {
  const rows = await client.customer.findMany({
    where: {
      tenant_id,
      status: "active",
      OR: [
        { name:          { contains: search, mode: "insensitive" } },
        { customer_code: { contains: search, mode: "insensitive" } },
        { nit:           { contains: search, mode: "insensitive" } },
        { nrc:           { contains: search, mode: "insensitive" } },
        { dui:           { contains: search, mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
    take: limit,
    select: {
      id:            true,
      customer_code: true,
      name:          true,
      taxpayer_type: true,
      nit:           true,
      nrc:           true,
      dui:           true,
      activity_code: true,
    },
  });

  return rows.map((r) => ({
    id:            r.id,
    customer_code: r.customer_code,
    name:          r.name,
    taxpayer_type: r.taxpayer_type as CustomerForSaleLookup["taxpayer_type"],
    nit:           r.nit,
    nrc:           r.nrc,
    dui:           r.dui,
    activity_code: r.activity_code,
  }));
}
