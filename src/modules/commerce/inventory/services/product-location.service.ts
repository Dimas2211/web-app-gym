// ─────────────────────────────────────────────────────────────────
// commerce/inventory — product-location.service.ts
//
// Lógica de escritura reusable para ProductLocation.
// Sin "use server" — importable tanto desde server actions como
// desde route handlers sin restricciones del compilador de Next.js.
//
// Llamado desde:
//   actions/create-product-location.action.ts
//   actions/update-product-location.action.ts
//   app/api/inventory/product-locations/route.ts
//   app/api/inventory/product-locations/[id]/status/route.ts
// ─────────────────────────────────────────────────────────────────

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CreateProductLocationInput } from "../schemas/create-product-location.schema";
import type { UpdateProductLocationInput } from "../schemas/update-product-location.schema";

// ── Tipos de resultado ────────────────────────────────────────────

export type CreateProductLocationResult =
  | { ok: true; id: string }
  | { ok: false; field?: string; error: string };

export type UpdateProductLocationResult =
  | { ok: true }
  | { ok: false; error: string };

// ── Crear registro operativo ──────────────────────────────────────

/**
 * Crea el registro operativo inicial de un producto en una location.
 * current_stock siempre inicia en 0 — no es un parámetro de esta función.
 *
 * @throws Error de sistema (no de negocio) si la BD falla por razón inesperada.
 */
export async function createProductLocation(
  tenant_id:   string,
  location_id: string,
  user_id:     string,
  input:       CreateProductLocationInput,
): Promise<CreateProductLocationResult> {
  // Verificar que el producto existe en el tenant
  const product = await prisma.product.findFirst({
    where: { id: input.product_id, tenant_id },
    select: { id: true },
  });
  if (!product) {
    return {
      ok:    false,
      field: "product_id",
      error: "El producto no existe en el catálogo del tenant.",
    };
  }

  // Verificar unicidad antes de insertar (early feedback antes del constraint)
  const existing = await prisma.productLocation.findFirst({
    where: { tenant_id, location_id, product_id: input.product_id },
    select: { id: true },
  });
  if (existing) {
    return {
      ok:    false,
      field: "product_id",
      error: "Este producto ya tiene un registro operativo en la location actual.",
    };
  }

  try {
    const pl = await prisma.productLocation.create({
      data: {
        tenant_id,
        location_id,
        product_id:       input.product_id,
        current_stock:    0,               // siempre 0 — no viene del input
        min_stock:        input.min_stock,
        reorder_quantity: input.reorder_quantity,
        warehouse:        input.warehouse  ?? null,
        shelf:            input.shelf      ?? null,
        position:         input.position   ?? null,
        is_active:        input.is_active,
        created_by:       user_id,
        updated_by:       user_id,
      },
      select: { id: true },
    });
    return { ok: true, id: pl.id };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        ok:    false,
        field: "product_id",
        error: "Este producto ya tiene un registro operativo en la location actual.",
      };
    }
    throw e;
  }
}

// ── Actualizar campos operativos ──────────────────────────────────

/**
 * Actualiza solo los campos editables de un ProductLocation.
 * current_stock, tenant_id, location_id y product_id son inmutables.
 *
 * @throws Error de sistema si la BD falla por razón inesperada.
 */
export async function updateProductLocationFields(
  id:          string,
  tenant_id:   string,
  location_id: string,
  user_id:     string,
  input:       UpdateProductLocationInput,
): Promise<UpdateProductLocationResult> {
  const existing = await prisma.productLocation.findFirst({
    where: { id, tenant_id, location_id },
    select: { id: true },
  });
  if (!existing) {
    return {
      ok:    false,
      error: "El registro de inventario no existe o no pertenece a la location actual.",
    };
  }

  // Solo se incluyen en data los campos que vienen en el input.
  // current_stock queda explícitamente fuera — solo cambia vía movimiento.
  await prisma.productLocation.update({
    where: { id },
    data: {
      ...(input.min_stock        !== undefined && { min_stock:        input.min_stock }),
      ...(input.reorder_quantity !== undefined && { reorder_quantity: input.reorder_quantity }),
      ...(input.warehouse        !== undefined && { warehouse:        input.warehouse }),
      ...(input.shelf            !== undefined && { shelf:            input.shelf }),
      ...(input.position         !== undefined && { position:         input.position }),
      ...(input.is_active        !== undefined && { is_active:        input.is_active }),
      updated_by: user_id,
      // updated_at se actualiza automáticamente por @updatedAt
    },
  });

  return { ok: true };
}
