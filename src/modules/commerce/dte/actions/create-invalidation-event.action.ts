"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-invalidation-event.action.ts
//
// Server Action: crea un DteInvalidationEvent en estado DRAFT.
//
// Reglas:
//   - Sesión requerida (requireAdmin).
//   - tenant_id y location_id se inyectan desde sesión.
//   - No devuelve event_json al frontend.
//   - Solo indica si la creación fue exitosa, el id, y el eventGenerationCode.
// ─────────────────────────────────────────────────────────────────

import { z }                         from "zod";
import { revalidatePath }            from "next/cache";
import { requireAdmin }              from "@/lib/permissions/guards";
import { getEffectiveLocationId }    from "@/lib/location/active-location";
import {
  createInvalidationEvent,
} from "../services/create-invalidation-event.service";

// ── Zod schema ────────────────────────────────────────────────────

const personaSchema = z.object({
  nombre:          z.string().trim().min(1, "El nombre es requerido.").max(100),
  tipoDocumento:   z.string().trim().min(1, "El tipo de documento es requerido.").max(10),
  numeroDocumento: z.string().trim().min(1, "El número de documento es requerido.").max(20),
});

const createInvalidationEventInputSchema = z.object({
  dteDocumentId: z.string().uuid("El ID del documento DTE debe ser un UUID válido."),
  invalidationTypeCode: z.enum(["1", "2", "3"], {
    errorMap: () => ({ message: "El tipo de anulación debe ser 1, 2 o 3." }),
  }),
  reason: z
    .string()
    .trim()
    .max(500, "El motivo no puede superar los 500 caracteres.")
    .nullable()
    .optional(),
  replacementGenerationCode: z
    .string()
    .uuid("El código de generación de reemplazo debe ser un UUID válido.")
    .nullable()
    .optional(),
  responsable: personaSchema,
  solicita:    personaSchema,
});

export type CreateInvalidationEventInput = z.infer<typeof createInvalidationEventInputSchema>;

// ── Tipos de resultado ────────────────────────────────────────────

export type CreateInvalidationEventActionResult =
  | {
      ok:                  true;
      invalidationEventId: string;
      dteDocumentId:       string;
      status:              "DRAFT";
      eventGenerationCode: string;
    }
  | { ok: false; message: string; errors?: Record<string, string[]> };

// ── Action ────────────────────────────────────────────────────────

export async function createInvalidationEventAction(
  rawInput: CreateInvalidationEventInput,
): Promise<CreateInvalidationEventActionResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, message: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, message: "La sesión no tiene una location activa." };

  const parsed = createInvalidationEventInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok:      false,
      message: "Datos del evento de invalidación no válidos.",
      errors:  parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const result = await createInvalidationEvent({
    dteDocumentId:             parsed.data.dteDocumentId,
    invalidationTypeCode:      parsed.data.invalidationTypeCode,
    reason:                    parsed.data.reason ?? null,
    replacementGenerationCode: parsed.data.replacementGenerationCode ?? null,
    responsable:               parsed.data.responsable,
    solicita:                  parsed.data.solicita,
    userId:                    sessionUser.id,
    tenantId:                  tenant_id,
    locationId:                location_id,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath("/dashboard/dte/outgoing");

  return {
    ok:                  true,
    invalidationEventId: result.invalidationEventId,
    dteDocumentId:       result.dteDocumentId,
    status:              "DRAFT",
    eventGenerationCode: result.eventGenerationCode,
  };
}
