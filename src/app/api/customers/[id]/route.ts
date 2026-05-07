// ─────────────────────────────────────────────────────────────────
// api/customers/[id]/route.ts
//
// GET   /api/customers/:id — detalle de cliente
// PATCH /api/customers/:id — actualizar datos de cliente
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions/guards";
import { getCustomerById } from "@/modules/commerce/customers/queries/get-customer-by-id";
import { updateCustomerSchema } from "@/modules/commerce/customers/schemas/customer.schemas";
import { updateCustomer } from "@/modules/commerce/customers/services/customer.service";
import { getCustomerApiContext } from "../customer-api-context";

// ── GET — detalle ──────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getCustomerApiContext();
  if (!ctx.ok) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  const customer = await getCustomerById(id, ctx.tenant_id);
  if (!customer) {
    return NextResponse.json({ ok: false, error: "El cliente no fue encontrado." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: customer }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

// ── PATCH — actualizar ────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;

  if (!tenant_id) {
    return NextResponse.json({ ok: false, error: "Sesión sin tenant activo." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "Body JSON requerido." }, { status: 400 });
  }

  const parsed = updateCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await updateCustomer(id, tenant_id, sessionUser.id, parsed.data);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}
