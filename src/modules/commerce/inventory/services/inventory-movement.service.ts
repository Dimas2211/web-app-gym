// ─────────────────────────────────────────────────────────────────
// commerce/inventory — inventory-movement.service.ts
//
// Lógica transaccional de movimientos de inventario.
// Sin "use server" — importable desde actions y route handlers.
//
// Contiene el ciclo completo de un movimiento:
//   leer saldo → validar → crear movimiento → actualizar saldo
// Todo dentro de una transacción Prisma atómica.
//
// Llamado desde:
//   actions/record-inventory-movement.action.ts
//   app/api/inventory/movements/route.ts
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
// MovementType (enum completo) permite que commerce/purchases pase PURCHASE_IN
// directamente sin pasar por el schema de la action, que sigue restringido a
// ACTIVE_MOVEMENT_TYPES para movimientos manuales.
import type { MovementType } from "../types/inventory-movement.types";
import { getMovementDirection } from "../utils/movement-direction.utils";

// ── Tipos de entrada y resultado ──────────────────────────────────

export interface MovementServiceInput {
  product_location_id: string;
  movement_type:       MovementType;   // todos los tipos del enum; la action restringe manualmente
  quantity:            number;          // siempre > 0
  unit_cost?:          number;
  reference_entity?:   string;
  reference_id?:       string;
  reference_code?:     string;
  notes?:              string;
}

export type MovementResult =
  | { ok: true }
  | { ok: false; error: string };

// ── Servicio de movimiento ────────────────────────────────────────

/**
 * Registra un movimiento de inventario y actualiza el saldo
 * del ProductLocation en una sola transacción atómica.
 *
 * Secuencia dentro de la transacción:
 *   1. Leer y validar ProductLocation (existencia + estado activo).
 *   2. Capturar stock_before dentro de la tx.
 *   3. Calcular resulting_stock con getMovementDirection.
 *   4. Rechazar saldo negativo.
 *   5. Crear InventoryMovement (inmutable).
 *   6. Actualizar current_stock en ProductLocation.
 *
 * Nota de concurrencia: ver record-inventory-movement.action.ts.
 *
 * @returns { ok: true } si el movimiento se registró correctamente.
 * @returns { ok: false, error } para errores de negocio conocidos.
 * @throws  Error de sistema no clasificado (BD, red, etc.).
 */
export async function recordInventoryMovement(
  tenant_id:    string,
  location_id:  string,
  performed_by: string,
  input:        MovementServiceInput,
): Promise<MovementResult> {
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Leer ProductLocation dentro de la tx
      const pl = await tx.productLocation.findFirst({
        where: {
          id:          input.product_location_id,
          tenant_id,
          location_id,
        },
        select: {
          id:            true,
          product_id:    true,
          current_stock: true,
          is_active:     true,
        },
      });

      if (!pl) {
        throw new Error(
          "El registro de inventario no existe o no pertenece a la location actual.",
        );
      }

      // 2. Rechazar movimientos sobre registros inactivos
      if (!pl.is_active) {
        throw new Error(
          "No se pueden registrar movimientos sobre un producto inactivo en esta location. " +
            "Reactiva el registro antes de operar.",
        );
      }

      // 3. Calcular saldos
      const stock_before   = Number(pl.current_stock);
      const direction      = getMovementDirection(input.movement_type);
      const resulting_stock =
        direction === "ADDITIVE"
          ? stock_before + input.quantity
          : stock_before - input.quantity;

      // 4. Rechazar saldo negativo
      if (resulting_stock < 0) {
        throw new Error(
          `Saldo insuficiente. Stock actual: ${stock_before}, ` +
            `cantidad solicitada: ${input.quantity}.`,
        );
      }

      // 5. Crear movimiento inmutable
      // product_id se obtiene del ProductLocation leído — no viene del exterior.
      await tx.inventoryMovement.create({
        data: {
          tenant_id,
          location_id,
          product_id:          pl.product_id,
          product_location_id: input.product_location_id,
          movement_type:       input.movement_type,
          quantity:            input.quantity,
          unit_cost:           input.unit_cost       ?? null,
          stock_before,
          resulting_stock,
          reference_entity:    input.reference_entity ?? null,
          reference_id:        input.reference_id     ?? null,
          reference_code:      input.reference_code   ?? null,
          notes:               input.notes            ?? null,
          performed_by,
        },
      });

      // 6. Actualizar saldo materializado
      await tx.productLocation.update({
        where: { id: pl.id },
        data:  { current_stock: resulting_stock },
      });
    });

    return { ok: true };
  } catch (e) {
    // Errores de negocio lanzados intencionalmente dentro de la tx
    if (e instanceof Error) return { ok: false, error: e.message };
    throw e; // error de sistema — no se silencia
  }
}
