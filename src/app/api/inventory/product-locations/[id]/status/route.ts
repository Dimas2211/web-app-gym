export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// PATCH /api/inventory/product-locations/[id]/status
// Activa o desactiva un ProductLocation en la location de sesión.
// Solo acepta el campo is_active en el body.
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { updateProductLocationFields } from "@/modules/commerce/inventory/services/product-location.service";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

const ADMIN_ROLES = ["super_admin", "branch_admin"];

// Schema estricto: solo is_active — ningún otro campo de update
const statusSchema = z.object({
  is_active: z.boolean({ required_error: "is_active es requerido y debe ser boolean" }),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const user = session.user as SessionUser;

  let handle;
  try {
    handle = await requireOperationalContext(user, { module: "commerce.inventory", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!ADMIN_ROLES.includes(context.effectiveUser.role)) {
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
      return NextResponse.json(
        { error: "La sesión no tiene tenant o location activos." },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo de la petición inválido." }, { status: 400 });
    }

    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { id } = await params;

    // Delegar al service con solo is_active — los demás campos quedan intactos
    const result = await updateProductLocationFields(
      id,
      context.tenantId,
      location_id,
      context.effectiveUser.id,
      { is_active: parsed.data.is_active },
      context.client,
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({ success: true, is_active: parsed.data.is_active });
  } finally {
    await dispose();
  }
}
