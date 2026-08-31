// ─────────────────────────────────────────────────────────────────
// api/customers/route.ts
//
// GET  /api/customers — listado paginado de clientes (tenant-level)
// POST /api/customers — crear cliente nuevo
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { listCustomers } from "@/modules/commerce/customers/queries/list-customers";
import { createCustomerSchema } from "@/modules/commerce/customers/schemas/customer.schemas";
import { createCustomer } from "@/modules/commerce/customers/services/customer.service";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { getCustomerApiContext } from "./customer-api-context";
import type { CustomerStatus } from "@/modules/commerce/customers/types/customer.types";

const VALID_STATUSES: readonly CustomerStatus[] = ["active", "inactive"];
const VALID_TAXPAYER  = ["FINAL_CONSUMER", "REGISTERED_TAXPAYER", "EXCLUDED_SUBJECT"] as const;
const VALID_SORT_FIELDS = ["customer_code", "name", "created_at"] as const;
const VALID_SORT_DIRS   = ["asc", "desc"] as const;

// ── GET — listado ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = await getCustomerApiContext();
  if (!ctx.ok) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  const sp = req.nextUrl.searchParams;

  const pageRaw     = parseInt(sp.get("page")      ?? "1",  10);
  const pageSizeRaw = parseInt(sp.get("page_size") ?? "25", 10);
  const page      = Number.isFinite(pageRaw)     ? Math.max(1, pageRaw)                    : 1;
  const page_size = Number.isFinite(pageSizeRaw) ? Math.min(100, Math.max(1, pageSizeRaw)) : 25;

  const statusRaw    = sp.get("status")         ?? undefined;
  const taxpayerRaw  = sp.get("taxpayer_type")  ?? undefined;
  const sortFieldRaw = sp.get("sort_field")     ?? undefined;
  const sortDirRaw   = sp.get("sort_direction") ?? undefined;

  const status        = statusRaw   && (VALID_STATUSES   as readonly string[]).includes(statusRaw)   ? statusRaw   as CustomerStatus : undefined;
  const taxpayer_type = taxpayerRaw && (VALID_TAXPAYER   as readonly string[]).includes(taxpayerRaw) ? taxpayerRaw as typeof VALID_TAXPAYER[number] : undefined;
  const sort_field    = sortFieldRaw && (VALID_SORT_FIELDS as readonly string[]).includes(sortFieldRaw) ? sortFieldRaw as typeof VALID_SORT_FIELDS[number] : "customer_code";
  const sort_direction = sortDirRaw && (VALID_SORT_DIRS as readonly string[]).includes(sortDirRaw) ? sortDirRaw as "asc" | "desc" : "asc";

  try {
    const data = await listCustomers({
      tenant_id:      ctx.tenant_id,
      status,
      taxpayer_type,
      search:         sp.get("search") ?? undefined,
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

// ── POST — crear cliente ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;

  if (!tenant_id) {
    return NextResponse.json({ ok: false, error: "Sesión sin tenant activo." }, { status: 401 });
  }

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) {
    return NextResponse.json({ ok: false, error: RUNTIME_READONLY_MESSAGE }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "Body JSON requerido." }, { status: 400 });
  }

  const parsed = createCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await createCustomer(tenant_id, sessionUser.id, parsed.data);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }

  return NextResponse.json(
    { ok: true, data: { id: result.id, customer_code: result.customer_code } },
    { status: 201 },
  );
}
