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

const ADMIN_ROLES = ["super_admin", "branch_admin"];

function toHttpStatus(code: SupplierErrorCode): number {
  switch (code) {
    case "NOT_FOUND": return 404;
    default:          return 422;
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as SessionUser;
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  // id del path param — inyectado al objeto antes de validar.
  const parsed = toggleSupplierStatusSchema.safeParse({
    id:     params.id,
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
