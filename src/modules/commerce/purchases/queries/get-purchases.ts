// ─────────────────────────────────────────────────────────────────
// commerce/purchases — get-purchases.ts
//
// Listado paginado de compras por location.
// Solo lectura — no toca estado.
// ─────────────────────────────────────────────────────────────────

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { PurchaseFilters } from "../types/purchase-filters.types";
import type { PurchaseListItem } from "../types/purchase.types";

export interface PurchasesPage {
  items: PurchaseListItem[];
  total: number;
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

export async function getPurchases(
  filters: PurchaseFilters,
  client: PrismaClient = prisma,
): Promise<PurchasesPage> {
  const {
    tenant_id,
    location_id,
    status,
    supplier_id,
    supplier_search,
    date_from,
    date_to,
    search,
    document_number_search,
    sort_field     = "purchase_date",
    sort_direction = "desc",
    page      = 1,
    page_size = 25,
  } = filters;

  // ── Rango de fechas: bloque único para evitar sobreescritura silenciosa ──
  const dateFilter: Prisma.PurchaseWhereInput["purchase_date"] =
    date_from || date_to
      ? {
          ...(date_from && { gte: dateOnly(date_from) }),
          ...(date_to   && { lte: dateOnly(date_to)   }),
        }
      : undefined;

  const where: Prisma.PurchaseWhereInput = {
    tenant_id,
    location_id,
    ...(status           && { status }),
    ...(supplier_id      && { supplier_id }),
    ...(supplier_search  && {
      supplier: {
        OR: [
          { name: { contains: supplier_search, mode: "insensitive" } },
          { nrc:  { contains: supplier_search, mode: "insensitive" } },
          { nit:  { contains: supplier_search, mode: "insensitive" } },
        ],
      },
    }),
    ...(dateFilter               && { purchase_date: dateFilter }),
    ...(search                   && { purchase_code:    { contains: search,                   mode: "insensitive" } }),
    ...(document_number_search   && { document_number:  { contains: document_number_search,   mode: "insensitive" } }),
  };

  // ── Ordenamiento tipado con el contrato de Prisma ──────────────
  const orderByMap: Record<string, Prisma.PurchaseOrderByWithRelationInput> = {
    purchase_code: { purchase_code: sort_direction },
    purchase_date: { purchase_date: sort_direction },
    supplier_name: { supplier: { name: sort_direction } },
    total_amount:  { total_amount: sort_direction },
    status:        { status: sort_direction },
    created_at:    { created_at: sort_direction },
  };
  const orderBy: Prisma.PurchaseOrderByWithRelationInput =
    orderByMap[sort_field] ?? { purchase_date: "desc" };

  const skip = (page - 1) * page_size;

  const [rows, total] = await Promise.all([
    client.purchase.findMany({
      where,
      orderBy,
      skip,
      take: page_size,
      select: {
        id:            true,
        tenant_id:     true,
        location_id:   true,
        supplier_id:   true,
        purchase_code: true,
        purchase_date: true,
        document_series:   true,
        document_number:   true,
        payment_condition: true,
        cancellation_type: true,
        status:        true,
        source_type:   true,
        subtotal:      true,
        tax_amount:    true,
        total_amount:  true,
        created_at:    true,
        supplier: { select: { name: true, nrc: true } },
        _count:   { select: { items: true } },
      },
    }),
    client.purchase.count({ where }),
  ]);

  const items: PurchaseListItem[] = rows.map((r) => ({
    id:            r.id,
    tenant_id:     r.tenant_id,
    location_id:   r.location_id,
    supplier_id:   r.supplier_id,
    supplier_name: r.supplier.name,
    supplier_nrc:  r.supplier.nrc,
    purchase_code: r.purchase_code,
    purchase_date: r.purchase_date,
    purchase_date_label: r.purchase_date.toLocaleDateString("es-CL"),
    document_series:   r.document_series,
    document_number:   r.document_number,
    payment_condition: r.payment_condition,
    cancellation_type: r.cancellation_type,
    status:        r.status,
    source_type:   r.source_type,
    subtotal:      Number(r.subtotal),
    tax_amount:    Number(r.tax_amount),
    total_amount:  Number(r.total_amount),
    item_count:    r._count.items,
    created_at:    r.created_at,
    created_at_label: r.created_at.toLocaleDateString("es-CL"),
  }));

  return { items, total };
}
