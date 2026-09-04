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
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import { updateProductStatusSchema } from "@/modules/commerce/products/schemas/update-product-status.schema";
import { isValidTransition } from "@/modules/commerce/products/utils/product-status.utils";
import type { ProductStatus } from "@/modules/commerce/products/types/product.types";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  withCapacityCheckedTransaction,
  isProductCountedForCapacity,
  capacityDelta,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

// Roles que pueden cambiar el estado del catálogo
const ADMIN_ROLES = ["super_admin", "branch_admin"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: productId } = await params;

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

  // Bloque B: módulo commerce.products debe estar habilitado
  const commercialCtx = await resolveCommercialEnforcementContext(user.tenant_id);
  try {
    assertOrganizationModule(commercialCtx, "commerce.products");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
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
    id: productId,
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

  // ── Aplicar cambio — delta de capacidad exclusivamente desde
  // isProductCountedForCapacity (todo estado excepto DISCONTINUED
  // consume cupo), nunca comparando nextStatus contra "ACTIVE" ─────
  const delta = capacityDelta(isProductCountedForCapacity(currentStatus), isProductCountedForCapacity(nextStatus));

  try {
    if (delta > 0) {
      await withCapacityCheckedTransaction(prisma, "commerce.products.max", delta, commercialCtx, (tx) =>
        tx.product.update({ where: { id }, data: { status: nextStatus, updated_by: user.id } }),
      );
    } else {
      await prisma.product.update({
        where: { id },
        data: { status: nextStatus, updated_by: user.id },
      });
    }
  } catch (err) {
    if (err instanceof CommercialEnforcementError) {
      return NextResponse.json({ error: err.userMessage }, { status: err.httpStatus });
    }
    throw err;
  }

  return NextResponse.json({ success: true, status: nextStatus });
}
