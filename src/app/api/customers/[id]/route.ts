// ─────────────────────────────────────────────────────────────────
// api/customers/[id]/route.ts
//
// GET   /api/customers/:id — detalle de cliente
// PATCH /api/customers/:id — actualizar datos de cliente
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getCapabilities } from "@/core/permissions/role-capabilities";
import type { UserRole } from "@prisma/client";
import { getCustomerById } from "@/modules/commerce/customers/queries/get-customer-by-id";
import { updateCustomerSchema } from "@/modules/commerce/customers/schemas/customer.schemas";
import { updateCustomer } from "@/modules/commerce/customers/services/customer.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";
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

  try {
    const customer = await getCustomerById(id, ctx.tenant_id, ctx.client);
    if (!customer) {
      return NextResponse.json({ ok: false, error: "El cliente no fue encontrado." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: customer }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } finally {
    await ctx.dispose();
  }
}

// ── PATCH — actualizar ────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  const user = session.user as SessionUser;

  let handle;
  try {
    handle = await requireOperationalContext(user, { module: "core.customers", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return NextResponse.json({ ok: false, error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!getCapabilities(context.effectiveUser.role as UserRole).canManageStaff) {
      return NextResponse.json({ ok: false, error: "Sin permisos para esta operación." }, { status: 403 });
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

    const result = await updateCustomer(id, context.tenantId, context.effectiveUser.id, parsed.data, context.client);

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
    }

    return NextResponse.json({ ok: true });
  } finally {
    await dispose();
  }
}
