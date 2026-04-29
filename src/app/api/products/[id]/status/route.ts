export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────
// PATCH /api/products/[id]/status  — cambiar estado de un producto
//
// Reutiliza:
//   - updateProductStatusSchema para validación
//   - isValidTransition para la máquina de estados
//   - prisma directamente para la actualización
//
// La máquina de estados (`isValidTransition`) está definida y exportada
// en update-product-status.action.ts para evitar duplicar la lógica.
// ─────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import type { SessionUser } from "@/lib/permissions/guards";
import { prisma } from "@/lib/db/prisma";
import { updateProductStatusSchema } from "@/modules/commerce/products/schemas/update-product-status.schema";
import { isValidTransition } from "@/modules/commerce/products/utils/product-status.utils";
import type { ProductStatus } from "@/modules/commerce/products/types/product.types";

// Roles que pueden cambiar el estado del catálogo
const ADMIN_ROLES = ["super_admin", "branch_admin"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as SessionUser;
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  // ── Parseo del body ─────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Cuerpo de la petición inválido." },
      { status: 400 }
    );
  }

  // ── Validación Zod (id viene del path param, status del body) ───
  const parsed = updateProductStatusSchema.safeParse({
    id: params.id,
    status: (body as Record<string, unknown>)?.status,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { id, status: nextStatus } = parsed.data;

  // ── Cargar producto y verificar pertenencia al tenant ───────────
  const product = await prisma.product.findFirst({
    where: { id, tenant_id: user.tenant_id },
    select: { id: true, status: true },
  });

  if (!product) {
    return NextResponse.json(
      { error: "Producto no encontrado o sin acceso." },
      { status: 404 }
    );
  }

  const currentStatus = product.status as ProductStatus;

  // ── Validar que no sea una no-operación ─────────────────────────
  if (currentStatus === nextStatus) {
    return NextResponse.json(
      { error: "El producto ya tiene ese estado." },
      { status: 400 }
    );
  }

  // ── Validar transición ──────────────────────────────────────────
  if (!isValidTransition(currentStatus, nextStatus)) {
    const message =
      currentStatus === "DISCONTINUED"
        ? "No se puede cambiar el estado de un producto discontinuado."
        : `La transición de ${currentStatus} a ${nextStatus} no está permitida.`;

    return NextResponse.json({ error: message }, { status: 422 });
  }

  // ── Aplicar cambio ──────────────────────────────────────────────
  await prisma.product.update({
    where: { id },
    data: {
      status:     nextStatus,
      updated_by: user.id,
    },
  });

  return NextResponse.json({ success: true, status: nextStatus });
}
