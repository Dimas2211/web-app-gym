"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/products — update-product-status.action.ts
//
// Cambia el estado de un producto del catálogo maestro.
// No implementa edición completa; solo la transición de estado.
//
// Permiso: requireAdmin (super_admin | branch_admin).
//
// Máquina de estados de productos:
//
//   ACTIVE          → INACTIVE | DISCONTINUED | BLOCKED_PURCHASE | BLOCKED_SALE
//   INACTIVE        → ACTIVE | DISCONTINUED | BLOCKED_PURCHASE | BLOCKED_SALE
//   DISCONTINUED    → (terminal — sin transiciones posibles)
//   BLOCKED_PURCHASE → ACTIVE | INACTIVE | BLOCKED_SALE
//   BLOCKED_SALE    → ACTIVE | INACTIVE | BLOCKED_PURCHASE
//
// DISCONTINUED es estado terminal: significa fin de vida del producto.
// No se permite reactivar un producto discontinuado. Si se necesita
// ese comportamiento en el futuro, evaluar si conviene crear un nuevo
// producto o extender la máquina de estados.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/permissions/guards";
import { updateProductStatusSchema } from "../schemas/update-product-status.schema";
import type { ProductStatus } from "../types/product.types";
// Lógica de transiciones en utils para que cliente y servidor compartan
// la misma fuente sin importar un archivo "use server" desde un componente.
import { isValidTransition } from "../utils/product-status.utils";

// ── Estado de retorno ─────────────────────────────────────────────

export type UpdateProductStatusState =
  | { error?: string; errors?: Record<string, string[]> }
  | undefined;

// ── Action ────────────────────────────────────────────────────────

export async function updateProductStatusAction(
  _prev: UpdateProductStatusState,
  formData: FormData
): Promise<UpdateProductStatusState> {
  // 1. Sesión y permisos
  const sessionUser = await requireAdmin();
  const tenantId = sessionUser.tenant_id;

  // 2. Validación Zod
  const raw = {
    id:     formData.get("id"),
    status: formData.get("status"),
  };

  const parsed = updateProductStatusSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const { id, status: nextStatus } = parsed.data;

  // 3. Cargar producto y verificar pertenencia al tenant
  const product = await prisma.product.findFirst({
    where: { id, tenant_id: tenantId },
    select: { id: true, status: true, name: true },
  });

  if (!product) {
    return { error: "Producto no encontrado o sin acceso." };
  }

  // 4. Validar transición de estado
  const currentStatus = product.status as ProductStatus;

  if (currentStatus === nextStatus) {
    return { error: "El producto ya tiene ese estado." };
  }

  if (!isValidTransition(currentStatus, nextStatus)) {
    return {
      error: `La transición de ${currentStatus} a ${nextStatus} no está permitida.`,
    };
  }

  // 5. Aplicar cambio de estado
  await prisma.product.update({
    where: { id },
    data: {
      status:     nextStatus,
      updated_by: sessionUser.id,
      // updated_at se actualiza automáticamente por @updatedAt en el schema
    },
  });

  revalidatePath("/dashboard/products");
  revalidatePath(`/dashboard/products/${id}`);
}
