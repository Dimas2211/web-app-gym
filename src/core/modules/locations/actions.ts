/**
 * Mutaciones del dominio Location.
 *
 * Funciones async puras — NO son Server Actions.
 * No leen sesión, no redirigen, no revalidan rutas.
 * El caller (wrapper GYM u otro módulo) es responsable de:
 *   - autenticar al usuario y extraer tenantId
 *   - llamar redirect() / revalidatePath() tras el resultado
 *   - aplicar efectos secundarios específicos de la industria
 *
 * Fuente de datos: tabla `branches` (alias Location en el sistema actual).
 * Relación de campos:
 *   Branch.gym_id  ←→  tenantId (parámetro)
 *   Branch.id      ←→  locationId (parámetro)
 */

import { prisma } from "@/lib/db/prisma";
import { updateLocationSchema } from "./schemas";
import {
  withCapacityCheckedTransaction,
  isLocationCountedForCapacity,
  capacityDelta,
  CommercialEnforcementError,
  type CommercialEnforcementContext,
} from "@/modules/platform/runtime/commercial-enforcement";

// ─── Contrato de retorno ───────────────────────────────────────────────────────

export type LocationActionResult =
  | { success: true; id: string }
  | { success: false; errors?: Record<string, string[]>; error?: string };

// ─── Crear location ────────────────────────────────────────────────────────────

/**
 * Crea una nueva location dentro del tenant indicado.
 * tenant_id no forma parte del input validado — viene siempre del caller.
 *
 * `ctx` es el Commercial Enforcement Context ya resuelto por el caller
 * (Bloque B) — se verifica capacidad core.locations.max antes del write.
 * Toda alta se crea status:"active" (delta +1), verificado y escrito en
 * la misma transacción Serializable vía withCapacityCheckedTransaction.
 */
export async function createLocation(
  tenantId: string,
  input: unknown,
  ctx: CommercialEnforcementContext,
): Promise<LocationActionResult> {
  const parsed = updateLocationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  if (!parsed.data.name) {
    return { success: false, error: "El nombre es obligatorio." };
  }

  const delta = capacityDelta(false, isLocationCountedForCapacity("active"));

  try {
    const location = await withCapacityCheckedTransaction(
      prisma,
      "core.locations.max",
      delta,
      ctx,
      (tx) =>
        tx.branch.create({
          data: {
            name: parsed.data.name!,
            address: parsed.data.address ?? null,
            phone: parsed.data.phone ?? null,
            gym_id: tenantId,
            status: "active",
          },
          select: { id: true },
        }),
    );
    return { success: true, id: location.id };
  } catch (err) {
    if (err instanceof CommercialEnforcementError) {
      return { success: false, error: err.userMessage };
    }
    throw err;
  }
}

// ─── Actualizar location ───────────────────────────────────────────────────────

/**
 * Actualiza los campos editables de una location.
 * Verifica que la location pertenezca al tenant antes de escribir.
 */
export async function updateLocation(
  locationId: string,
  tenantId: string,
  input: unknown
): Promise<LocationActionResult> {
  const parsed = updateLocationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.branch.findFirst({
    where: { id: locationId, gym_id: tenantId },
    select: { id: true },
  });

  if (!existing) {
    return { success: false, error: "Location no encontrada." };
  }

  await prisma.branch.update({
    where: { id: locationId },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.address !== undefined && { address: parsed.data.address }),
      ...(parsed.data.phone !== undefined && { phone: parsed.data.phone }),
    },
  });

  return { success: true, id: locationId };
}

// ─── Cambiar estado de location ────────────────────────────────────────────────

/**
 * Alterna el estado active/inactive de una location.
 * Verifica que la location pertenezca al tenant antes de escribir.
 * No hace borrado físico.
 *
 * Delta de capacidad real según la transición (inactive->active = +1,
 * verificado; active->inactive = -1, siempre permitido sin Serializable
 * porque nunca compite por el límite).
 */
export async function toggleLocationStatus(
  locationId: string,
  tenantId: string,
  ctx: CommercialEnforcementContext,
): Promise<LocationActionResult> {
  const location = await prisma.branch.findFirst({
    where: { id: locationId, gym_id: tenantId },
    select: { id: true, status: true },
  });

  if (!location) {
    return { success: false, error: "Location no encontrada." };
  }

  const nextStatus = location.status === "active" ? "inactive" : "active";
  const delta = capacityDelta(isLocationCountedForCapacity(location.status), isLocationCountedForCapacity(nextStatus));

  try {
    if (delta > 0) {
      await withCapacityCheckedTransaction(prisma, "core.locations.max", delta, ctx, (tx) =>
        tx.branch.update({ where: { id: locationId }, data: { status: nextStatus } }),
      );
    } else {
      await prisma.branch.update({ where: { id: locationId }, data: { status: nextStatus } });
    }
    return { success: true, id: locationId };
  } catch (err) {
    if (err instanceof CommercialEnforcementError) {
      return { success: false, error: err.userMessage };
    }
    throw err;
  }
}
