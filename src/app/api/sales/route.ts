// ─────────────────────────────────────────────────────────────────
// api/sales/route.ts
//
// GET  /api/sales — listado paginado de ventas (tenant + location)
// POST /api/sales — crear venta en DRAFT
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { listSales } from "@/modules/commerce/sales/queries/list-sales";
import { createSaleDraftSchema } from "@/modules/commerce/sales/schemas/sale.schemas";
import { createSaleDraft } from "@/modules/commerce/sales/services/sale.service";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { getSaleApiContext } from "./sale-api-context";
import type { SaleStatus, SalePaymentStatus } from "@/modules/commerce/sales/types/sale.types";

const VALID_STATUSES:         readonly SaleStatus[]        = ["DRAFT", "CONFIRMED", "CANCELLED"];
const VALID_PAYMENT_STATUSES: readonly SalePaymentStatus[] = ["UNPAID", "PARTIAL", "PAID", "REFUNDED"];
const VALID_SORT_FIELDS  = ["sale_code", "sale_date", "total_amount", "status", "created_at"] as const;
const VALID_SORT_DIRS    = ["asc", "desc"] as const;

// ── GET — listado ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = await getSaleApiContext(req);
  if (!ctx.ok) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  const sp = req.nextUrl.searchParams;

  const pageRaw     = parseInt(sp.get("page")      ?? "1",  10);
  const pageSizeRaw = parseInt(sp.get("page_size") ?? "25", 10);
  const page      = Number.isFinite(pageRaw)     ? Math.max(1, pageRaw)                    : 1;
  const page_size = Number.isFinite(pageSizeRaw) ? Math.min(100, Math.max(1, pageSizeRaw)) : 25;

  const statusRaw        = sp.get("status")         ?? undefined;
  const paymentStatusRaw = sp.get("payment_status") ?? undefined;
  const sortFieldRaw     = sp.get("sort_field")     ?? undefined;
  const sortDirRaw       = sp.get("sort_direction") ?? undefined;

  const status         = statusRaw        && (VALID_STATUSES         as readonly string[]).includes(statusRaw)        ? statusRaw        as SaleStatus                       : undefined;
  const payment_status = paymentStatusRaw && (VALID_PAYMENT_STATUSES as readonly string[]).includes(paymentStatusRaw) ? paymentStatusRaw as SalePaymentStatus                : undefined;
  const sort_field     = sortFieldRaw     && (VALID_SORT_FIELDS      as readonly string[]).includes(sortFieldRaw)     ? sortFieldRaw     as typeof VALID_SORT_FIELDS[number] : "sale_date";
  const sort_direction = sortDirRaw       && (VALID_SORT_DIRS        as readonly string[]).includes(sortDirRaw)       ? sortDirRaw       as "asc" | "desc"                   : "desc";

  const customer_id = sp.get("customer_id") ?? undefined;
  const dateFrom    = sp.get("date_from")   ?? undefined;
  const dateTo      = sp.get("date_to")     ?? undefined;

  try {
    const data = await listSales({
      tenant_id:      ctx.tenant_id,
      location_id:    ctx.location_id,
      status,
      payment_status,
      customer_id,
      date_from:   dateFrom,
      date_to:     dateTo,
      search:      sp.get("search") ?? undefined,
      sort_field,
      sort_direction,
      page,
      page_size,
    }, ctx.client);

    return NextResponse.json({ ok: true, data });
  } finally {
    await ctx.dispose();
  }
}

// ── POST — crear venta DRAFT ───────────────────────────────────────

export async function POST(req: NextRequest) {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return NextResponse.json({ ok: false, error: "Sesión sin tenant activo." }, { status: 401 });
  if (!location_id) return NextResponse.json({ ok: false, error: "Selecciona una location activa para crear una venta." }, { status: 409 });

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) {
    return NextResponse.json({ ok: false, error: RUNTIME_READONLY_MESSAGE }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "Body JSON requerido." }, { status: 400 });
  }

  const parsed = createSaleDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await createSaleDraft(tenant_id, location_id, sessionUser.id, parsed.data);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }

  return NextResponse.json(
    { ok: true, data: { id: result.id, sale_code: result.sale_code } },
    { status: 201 },
  );
}
