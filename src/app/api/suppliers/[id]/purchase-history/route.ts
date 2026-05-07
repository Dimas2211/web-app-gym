export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/suppliers/[id]/purchase-history
//
// Historial de compras de un proveedor para el detalle inferior
// de /dashboard/suppliers (pestaña "Compras").
//
// Seguridad:
//   - tenant_id siempre desde sesión (getPurchaseApiContext).
//   - location_id desde cookie de sucursal activa (mismo patrón
//     que el módulo purchases — super_admin requiere cookie activa).
//   - supplier_id validado contra tenant_id antes de consultar.
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getPurchaseApiContext } from "@/app/api/purchases/purchase-api-context";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: supplierId } = await params;

  const ctx = await getPurchaseApiContext(req);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const { tenant_id, location_id } = ctx;

  // Validar que el proveedor pertenece al tenant antes de devolver compras
  const supplierExists = await prisma.supplier.findFirst({
    where: { id: supplierId, tenant_id },
    select: { id: true },
  });

  if (!supplierExists) {
    return NextResponse.json({ error: "Proveedor no encontrado." }, { status: 404 });
  }

  const rows = await prisma.purchase.findMany({
    where: {
      tenant_id,
      location_id,
      supplier_id: supplierId,
    },
    orderBy: { purchase_date: "desc" },
    take: 100,
    select: {
      id:            true,
      purchase_code: true,
      purchase_date: true,
      document_type:     true,
      document_series:   true,
      document_number:   true,
      status:            true,
      source_type:       true,
      payment_condition: true,
      subtotal:          true,
      tax_amount:        true,
      total_amount:      true,
      retention_1pct_applies: true,
      retention_1pct_amount:  true,
      created_by_user: { select: { first_name: true, last_name: true } },
    },
  });

  const items = rows.map((r) => {
    const totalAmount    = Number(r.total_amount);
    const retentionAmt   = Number(r.retention_1pct_amount);
    return {
      id:            r.id,
      purchase_code: r.purchase_code,
      purchase_date_label: r.purchase_date.toLocaleDateString("es-CL"),
      document_type:     r.document_type,
      document_series:   r.document_series,
      document_number:   r.document_number,
      status:            r.status,
      source_type:       r.source_type,
      payment_condition: r.payment_condition,
      subtotal:          Number(r.subtotal),
      tax_amount:        Number(r.tax_amount),
      total_amount:      totalAmount,
      retention_1pct_applies: r.retention_1pct_applies,
      retention_1pct_amount:  retentionAmt,
      net_to_pay:        totalAmount - retentionAmt,
      created_by_name:
        r.created_by_user
          ? `${r.created_by_user.first_name} ${r.created_by_user.last_name}`.trim()
          : null,
    };
  });

  return NextResponse.json({ items, total: items.length });
}
