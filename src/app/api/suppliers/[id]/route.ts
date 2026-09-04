export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// GET   /api/suppliers/[id]  — ficha completa de un proveedor
// PATCH /api/suppliers/[id]  — actualizar ficha completa
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { getSupplierById } from "@/modules/commerce/suppliers/queries/get-supplier-by-id";
import { updateSupplierSchema } from "@/modules/commerce/suppliers/schemas/update-supplier.schema";
import {
  updateSupplier,
  type SupplierErrorCode,
} from "@/modules/commerce/suppliers/services/supplier.service";
import { resolveEffectiveApiContext } from "@/modules/platform/runtime/effective-tenant-context";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

const ADMIN_ROLES = ["super_admin", "branch_admin"];

function toHttpStatus(code: SupplierErrorCode): number {
  switch (code) {
    case "NOT_FOUND":      return 404;
    case "DUPLICATE_CODE": return 409;
    default:               return 422;
  }
}

// ── GET /api/suppliers/[id] ───────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as SessionUser;
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const { context, dispose } = await resolveEffectiveApiContext({ tenantId: user.tenant_id });
  try {
    const commercialCtx = await resolveCommercialEnforcementContext(context.tenantId);
    try {
      assertOrganizationModule(commercialCtx, "commerce.suppliers");
    } catch (err) {
      if (err instanceof CommercialEnforcementError) {
        return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
      }
      throw err;
    }

    const supplier = await getSupplierById(context.tenantId, id, context.client);

    if (!supplier) {
      return NextResponse.json({ error: "Proveedor no encontrado." }, { status: 404 });
    }

    return NextResponse.json(supplier);
  } finally {
    await dispose();
  }
}

// ── PATCH /api/suppliers/[id] ─────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as SessionUser;
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  // PASO 6A: bloquear escritura bajo sesión runtime "Operar como cliente"
  if (await isRuntimeReadOnlyActive()) {
    return NextResponse.json({ error: RUNTIME_READONLY_MESSAGE }, { status: 403 });
  }

  const commercialCtx = await resolveCommercialEnforcementContext(user.tenant_id);
  try {
    assertOrganizationModule(commercialCtx, "commerce.suppliers");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  // id viene del path param — se inyecta al objeto antes de validar.
  // Si el body incluye id, el path param tiene prioridad.
  const parsed = updateSupplierSchema.safeParse({
    ...(body as object),
    id,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await updateSupplier(user.tenant_id, user.id, parsed.data);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.field && { field: result.field }) },
      { status: toHttpStatus(result.code) },
    );
  }

  return NextResponse.json({ success: true });
}
