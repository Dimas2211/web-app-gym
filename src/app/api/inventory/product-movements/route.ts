export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET /api/inventory/product-movements — movimientos de UN producto
//
// Consulta de solo lectura usada por Commerce → Consultas y reportes →
// Movimientos por producto y por sus exportaciones.
//
// Query params:
//   product_id     (obligatorio, UUID)
//   date_from      aaaa-mm-dd (día local El Salvador)
//   date_to        aaaa-mm-dd
//   movement_type  MovementType
//   page           1-based (pantalla)
//   page_size      ≤ 200 (pantalla)
//   mode=export    todas las filas del filtro (≤ MOVEMENT_EXPORT_MAX_ROWS);
//                  si se excede → 422 EXPORT_TOO_LARGE, nunca archivo parcial.
//
// tenant_id / location_id NO se aceptan del navegador: salen del
// contexto operacional efectivo (resolveInventoryReadContext).
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveInventoryReadContext } from "@/modules/commerce/inventory/server/resolve-inventory-read-context";
import { getProductMovementReport } from "@/modules/commerce/inventory/queries/get-product-movement-report";
import { ALL_MOVEMENT_TYPES } from "@/modules/commerce/inventory/utils/inventory-movement-labels";
import { isValidDateParam } from "@/modules/commerce/inventory/utils/sv-datetime";
import type { MovementType } from "@/modules/commerce/inventory/types/inventory-movement.types";

const dateParam = z
  .string()
  .refine(isValidDateParam, "Fecha inválida (formato aaaa-mm-dd).")
  .optional();

const querySchema = z
  .object({
    product_id:    z.string().uuid("Seleccioná un producto válido."),
    date_from:     dateParam,
    date_to:       dateParam,
    movement_type: z.enum(ALL_MOVEMENT_TYPES as [MovementType, ...MovementType[]]).optional(),
    page:          z.coerce.number().int().min(1).max(100000).optional(),
    page_size:     z.coerce.number().int().min(1).max(200).optional(),
    mode:          z.enum(["export"]).optional(),
  })
  .refine((q) => !q.date_from || !q.date_to || q.date_from <= q.date_to, {
    message: "La fecha inicial no puede ser posterior a la fecha final.",
    path: ["date_from"],
  });

export async function GET(req: NextRequest) {
  const raw = Object.fromEntries(
    [...req.nextUrl.searchParams.entries()].filter(([, v]) => v.trim() !== ""),
  );
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Parámetros inválidos.";
    return NextResponse.json({ error: first }, { status: 400 });
  }
  const q = parsed.data;

  const ctx = await resolveInventoryReadContext();
  if (!ctx.ok) return ctx.response;

  try {
    const result = await getProductMovementReport(
      {
        tenantId:     ctx.context.tenantId,
        locationId:   ctx.locationId,
        productId:    q.product_id,
        dateFrom:     q.date_from,
        dateTo:       q.date_to,
        movementType: q.movement_type,
        page:         q.page,
        pageSize:     q.page_size,
        exportAll:    q.mode === "export",
      },
      ctx.context.client,
    );

    if (!result.ok) {
      const status =
        result.code === "PRODUCT_NOT_FOUND" ? 404 :
        result.code === "EXPORT_TOO_LARGE"  ? 422 : 400;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result.report);
  } finally {
    await ctx.dispose();
  }
}
