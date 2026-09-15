// ─────────────────────────────────────────────────────────────────
// api/purchases/route.ts
//
// GET  /api/purchases — listado paginado de compras de la location activa
// POST /api/purchases — crear compra en DRAFT
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getPurchases } from "@/modules/commerce/purchases/queries/get-purchases";
import { createPurchaseSchema } from "@/modules/commerce/purchases/schemas/create-purchase.schema";
import { createPurchase } from "@/modules/commerce/purchases/services/purchase.service";
import type { PurchaseStatus } from "@/modules/commerce/purchases/types/purchase.types";
import type { PurchaseSortField } from "@/modules/commerce/purchases/types/purchase-filters.types";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
import { getPurchaseApiContext } from "./purchase-api-context";

// ── Constantes de validación ───────────────────────────────────────

const VALID_STATUSES:     readonly PurchaseStatus[]   = ["DRAFT", "CONFIRMED", "CANCELLED"];
const VALID_SORT_FIELDS:  readonly PurchaseSortField[] = [
  "purchase_code", "purchase_date", "supplier_name", "total_amount", "status", "created_at",
];
const VALID_SORT_DIRS = ["asc", "desc"] as const;

// ── GET — listado ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = await getPurchaseApiContext(req);

  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const sp = req.nextUrl.searchParams;

  // Parseo seguro de enteros: guard explícito de NaN antes de Math.max/Math.min
  const pageRaw     = parseInt(sp.get("page")      ?? "1",  10);
  const pageSizeRaw = parseInt(sp.get("page_size") ?? "25", 10);
  const page        = Number.isFinite(pageRaw)     ? Math.max(1, pageRaw)                      : 1;
  const page_size   = Number.isFinite(pageSizeRaw) ? Math.min(100, Math.max(1, pageSizeRaw))   : 25;

  // Validación runtime de enums — rechaza strings arbitrarios silenciosamente con fallback undefined
  const statusRaw     = sp.get("status")         ?? undefined;
  const sortFieldRaw  = sp.get("sort_field")      ?? undefined;
  const sortDirRaw    = sp.get("sort_direction")  ?? undefined;

  const status:         PurchaseStatus   | undefined = statusRaw    && (VALID_STATUSES    as readonly string[]).includes(statusRaw)   ? statusRaw    as PurchaseStatus   : undefined;
  const sort_field:     PurchaseSortField | undefined = sortFieldRaw && (VALID_SORT_FIELDS as readonly string[]).includes(sortFieldRaw) ? sortFieldRaw as PurchaseSortField : undefined;
  const sort_direction: "asc" | "desc"   | undefined = sortDirRaw   && (VALID_SORT_DIRS   as readonly string[]).includes(sortDirRaw)   ? sortDirRaw   as "asc" | "desc"   : undefined;

  try {
    const data = await getPurchases({
      tenant_id: ctx.tenant_id,
      location_id: ctx.location_id,
      status,
      supplier_id:     sp.get("supplier_id")     ?? undefined,
      supplier_search: sp.get("supplier_search") ?? undefined,
      date_from:       sp.get("date_from")       ?? undefined,
      date_to:         sp.get("date_to")         ?? undefined,
      search:                  sp.get("search")                  ?? undefined,
      document_number_search:  sp.get("document_number_search")  ?? undefined,
      sort_field,
      sort_direction,
      page,
      page_size,
    }, ctx.client);

    return NextResponse.json(data);
  } finally {
    await ctx.dispose();
  }
}

// ── POST — crear compra ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const user = session.user as SessionUser;

  let handle;
  try {
    handle = await requireOperationalContext(user, { module: "commerce.purchases", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!getCapabilities(context.effectiveUser.role as UserRole).canManageStaff) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    const location_id =
      context.locationId ??
      (await getEffectiveLocationId(
        { ...context.effectiveUser, role: context.effectiveUser.role as SessionUser["role"] } as SessionUser,
        context.client,
        context.tenantId,
      ));

    if (!location_id) {
      return NextResponse.json({ error: "Sesión sin tenant o location activa." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Body JSON requerido." }, { status: 400 });
    }

    const parsed = createPurchaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await createPurchase(
      context.tenantId,
      location_id,
      context.effectiveUser.id,
      parsed.data,
      context.client,
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json(
      { id: result.id, purchase_code: result.purchase_code },
      { status: 201 },
    );
  } finally {
    await dispose();
  }
}
