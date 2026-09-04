export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// PATCH /api/suppliers/[id]/status  — activar o inactivar proveedor
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { toggleSupplierStatusSchema } from "@/modules/commerce/suppliers/schemas/toggle-supplier-status.schema";
import {
  toggleSupplierStatus,
  type SupplierErrorCode,
} from "@/modules/commerce/suppliers/services/supplier.service";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

const ADMIN_ROLES = ["super_admin", "branch_admin"];

function toHttpStatus(code: SupplierErrorCode): number {
  switch (code) {
    case "NOT_FOUND": return 404;
    default:          return 422;
  }
}

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

  // id del path param — inyectado al objeto antes de validar.
  const parsed = toggleSupplierStatusSchema.safeParse({
    id,
    status: (body as Record<string, unknown>)?.status,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await toggleSupplierStatus(user.tenant_id, user.id, parsed.data);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: toHttpStatus(result.code) },
    );
  }

  return NextResponse.json({ success: true, status: parsed.data.status });
}
