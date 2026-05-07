// ─────────────────────────────────────────────────────────────────
// commerce/sales — get-sale-by-id.ts
//
// Cabecera de venta sin líneas — para operaciones de estado.
// Para el detalle completo con líneas, usar get-sale-detail-by-id.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";

export interface SaleHeader {
  id:             string;
  tenant_id:      string;
  location_id:    string;
  customer_id:    string | null;
  sale_code:      string;
  sale_year:      number;
  sale_month:     number;
  sale_sequence:  number;
  sale_date:      Date;
  status:         string;
  payment_status: string;
  inventory_moved: boolean;
  subtotal:       number;
  discount_amount: number;
  tax_amount:     number;
  total_amount:   number;
  created_by:     string | null;
  updated_by:     string | null;
}

export async function getSaleById(
  id:          string,
  tenant_id:   string,
  location_id: string,
): Promise<SaleHeader | null> {
  const row = await prisma.sale.findFirst({
    where: { id, tenant_id, location_id },
    select: {
      id:              true,
      tenant_id:       true,
      location_id:     true,
      customer_id:     true,
      sale_code:       true,
      sale_year:       true,
      sale_month:      true,
      sale_sequence:   true,
      sale_date:       true,
      status:          true,
      payment_status:  true,
      inventory_moved: true,
      subtotal:        true,
      discount_amount: true,
      tax_amount:      true,
      total_amount:    true,
      created_by:      true,
      updated_by:      true,
    },
  });

  if (!row) return null;

  return {
    id:              row.id,
    tenant_id:       row.tenant_id,
    location_id:     row.location_id,
    customer_id:     row.customer_id,
    sale_code:       row.sale_code,
    sale_year:       row.sale_year,
    sale_month:      row.sale_month,
    sale_sequence:   row.sale_sequence,
    sale_date:       row.sale_date,
    status:          row.status,
    payment_status:  row.payment_status,
    inventory_moved: row.inventory_moved,
    subtotal:        Number(row.subtotal),
    discount_amount: Number(row.discount_amount),
    tax_amount:      Number(row.tax_amount),
    total_amount:    Number(row.total_amount),
    created_by:      row.created_by,
    updated_by:      row.updated_by,
  };
}
