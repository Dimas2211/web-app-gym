// ─────────────────────────────────────────────────────────────────
// commerce/sales — list-sales.ts
// ─────────────────────────────────────────────────────────────────

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { SaleFilters } from "../schemas/sale.schemas";
import type { SaleListItem } from "../types/sale.types";

export interface SalesPage {
  items: SaleListItem[];
  total: number;
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

export async function listSales(filters: SaleFilters): Promise<SalesPage> {
  const {
    tenant_id,
    location_id,
    status,
    customer_id,
    date_from,
    date_to,
    search,
    sort_field     = "sale_date",
    sort_direction = "desc",
    page      = 1,
    page_size = 25,
  } = filters;

  const dateFilter: Prisma.SaleWhereInput["sale_date"] =
    date_from || date_to
      ? {
          ...(date_from && { gte: dateOnly(date_from) }),
          ...(date_to   && { lte: dateOnly(date_to)   }),
        }
      : undefined;

  const where: Prisma.SaleWhereInput = {
    tenant_id,
    location_id,
    ...(status      && { status }),
    ...(customer_id && { customer_id }),
    ...(dateFilter  && { sale_date: dateFilter }),
    ...(search      && {
      OR: [
        { sale_code:   { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
      ],
    }),
  };

  const orderByMap: Record<string, Prisma.SaleOrderByWithRelationInput> = {
    sale_code:    { sale_code:    sort_direction },
    sale_date:    { sale_date:    sort_direction },
    total_amount: { total_amount: sort_direction },
    status:       { status:       sort_direction },
    created_at:   { created_at:   sort_direction },
  };
  const orderBy = orderByMap[sort_field] ?? { sale_date: "desc" };

  const skip = (page - 1) * page_size;

  const [rows, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy,
      skip,
      take: page_size,
      select: {
        id:             true,
        tenant_id:      true,
        location_id:    true,
        customer_id:    true,
        sale_code:      true,
        sale_date:      true,
        status:         true,
        payment_status: true,
        subtotal:       true,
        discount_amount: true,
        tax_amount:     true,
        total_amount:   true,
        created_at:     true,
        customer: { select: { name: true } },
        _count:   { select: { items: true } },
      },
    }),
    prisma.sale.count({ where }),
  ]);

  const items: SaleListItem[] = rows.map((r) => ({
    id:             r.id,
    tenant_id:      r.tenant_id,
    location_id:    r.location_id,
    customer_id:    r.customer_id,
    customer_name:  r.customer?.name ?? null,
    sale_code:      r.sale_code,
    sale_date:      r.sale_date,
    sale_date_label: r.sale_date.toLocaleDateString("es-CL"),
    status:         r.status as SaleListItem["status"],
    payment_status: r.payment_status as SaleListItem["payment_status"],
    subtotal:       Number(r.subtotal),
    discount_amount: Number(r.discount_amount),
    tax_amount:     Number(r.tax_amount),
    total_amount:   Number(r.total_amount),
    item_count:     r._count.items,
    created_at:     r.created_at,
    created_at_label: r.created_at.toLocaleDateString("es-CL"),
  }));

  return { items, total };
}
