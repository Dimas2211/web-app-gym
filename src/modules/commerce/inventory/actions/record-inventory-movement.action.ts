"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/inventory — record-inventory-movement.action.ts
//
// Server action para registrar un movimiento de inventario.
// Capa HTTP/form fina: parsea FormData, valida con Zod,
// delega la transacción atómica al service.
//
// Lógica de negocio: services/inventory-movement.service.ts
//
// Tipos activos en Etapa 11:
//   INITIAL_LOAD, MANUAL_IN, MANUAL_OUT, ADJUSTMENT_UP, ADJUSTMENT_DOWN
//
// Nota de concurrencia:
//   prisma.$transaction (forma callback) ejecuta read+write en una sola
//   transacción de BD. En PostgreSQL (READ COMMITTED), el UPDATE sobre
//   ProductLocation adquiere un row-lock que reduce el riesgo de
//   actualizaciones perdidas ante accesos concurrentes moderados.
//   Esto es adecuado para el volumen esperado en esta etapa.
//   No es una garantía de serialización completa: si hay alta contención
//   real sobre el mismo ProductLocation, el saldo leído en el findFirst
//   puede haber sido modificado por otra tx antes de que llegue el UPDATE.
//   En ese escenario, la solución correcta es lectura bloqueante explícita
//   (SELECT ... FOR UPDATE via $executeRaw) o nivel de aislamiento SERIALIZABLE.
//
// Permiso: requireAdmin (super_admin | branch_admin).
// tenant_id y location_id se extraen de sesión — nunca del form.
// ─────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/permissions/guards";
import { ACTIVE_MOVEMENT_TYPES } from "../schemas/record-movement.schema";
import { recordInventoryMovement } from "../services/inventory-movement.service";

// ── Estado de retorno ─────────────────────────────────────────────

export type RecordMovementState =
  | { errors?: Record<string, string[]>; error?: string }
  | undefined;

// ── Schema local para FormData ────────────────────────────────────
// Valida solo los campos que vienen del form.
// tenant_id, location_id y performed_by se inyectan desde sesión.
// product_id se deriva del ProductLocation leído en la transacción.

const movementFormSchema = z.object({
  product_location_id: z.string().uuid("product_location_id debe ser un UUID válido"),
  movement_type: z.enum(ACTIVE_MOVEMENT_TYPES, {
    errorMap: () => ({
      message: `Tipo de movimiento no permitido. Valores aceptados: ${ACTIVE_MOVEMENT_TYPES.join(", ")}`,
    }),
  }),
  quantity:         z.coerce.number().positive("La cantidad debe ser mayor a cero"),
  unit_cost:        z.coerce.number().min(0, "unit_cost no puede ser negativo").optional(),
  reference_entity: z.string().trim().optional(),
  reference_id:     z.string().trim().optional(),
  reference_code:   z.string().trim().optional(),
  notes:            z.string().trim().optional(),
});

// ── Helpers de parseo FormData ────────────────────────────────────

function str(value: FormDataEntryValue | null): string | undefined {
  const s = value as string | null;
  if (s === null || s === undefined) return undefined;
  const t = s.trim();
  return t === "" ? undefined : t;
}

function parseDecimal(value: FormDataEntryValue | null): number | undefined {
  const s = (value as string | null)?.trim();
  if (!s) return undefined;
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
}

// ── Action ────────────────────────────────────────────────────────

export async function recordInventoryMovementAction(
  _prev: RecordMovementState,
  formData: FormData,
): Promise<RecordMovementState> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = sessionUser.location_id;

  if (!tenant_id)   return { error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { error: "La sesión no tiene una location activa." };

  const raw = {
    product_location_id: str(formData.get("product_location_id")),
    movement_type:       str(formData.get("movement_type")),
    quantity:            parseDecimal(formData.get("quantity")),
    unit_cost:           parseDecimal(formData.get("unit_cost")),
    reference_entity:    str(formData.get("reference_entity")),
    reference_id:        str(formData.get("reference_id")),
    reference_code:      str(formData.get("reference_code")),
    notes:               str(formData.get("notes")),
  };

  const parsed = movementFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const result = await recordInventoryMovement(
    tenant_id,
    location_id,
    sessionUser.id,
    parsed.data,
  );

  if (!result.ok) return { error: result.error };

  revalidatePath("/dashboard/inventory");
}
