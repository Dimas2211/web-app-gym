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
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const tenant_id   = user.tenant_id;
  const location_id = await getEffectiveLocationId(user);
  if (!tenant_id || !location_id) {
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
    tenant_id,
    location_id,
    user.id,
    { is_active: parsed.data.is_active },
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ success: true, is_active: parsed.data.is_active });
}
