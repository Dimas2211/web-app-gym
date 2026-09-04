"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-sign-transmit-invalidation.action.ts
//
// Orquestador completo de Invalidación DTE.
// Flujo en un solo paso desde el frontend:
//   DTE ACCEPTED → crear evento → firmar evento → transmitir a MH
//     → eventStatus ACCEPTED (DTE → INVALIDATED) | REJECTED (DTE sigue ACCEPTED)
//
// Reglas críticas:
//   - Nunca devuelve signed_jws, event_json completo ni tokens.
//   - Si cualquier paso falla, se detiene y devuelve el error.
//   - El evento queda en el estado alcanzado, no se revierte.
//   - Si MH acepta: DTE pasa a INVALIDATED.
//   - Si MH rechaza: DTE vuelve a ACCEPTED.
//   - V1: solo tipo 2 (Rescindir operación) habilitado.
//   - Permiso: requireAdmin.
// ─────────────────────────────────────────────────────────────────

import { z }                              from "zod";
import { revalidatePath }                 from "next/cache";
import { requireAdmin }                   from "@/lib/permissions/guards";
import { getEffectiveLocationId }         from "@/lib/location/active-location";
import { createInvalidationEvent }        from "../services/create-invalidation-event.service";
import { signInvalidationEvent }          from "../services/sign-invalidation-event.service";
import { transmitInvalidationEvent }      from "../services/transmit-invalidation-event.service";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
} from "@/modules/platform/runtime/commercial-enforcement";

// ── Input ─────────────────────────────────────────────────────────

const personaSchema = z.object({
  nombre:          z.string().trim().min(1, "El nombre es requerido.").max(100),
  tipoDocumento:   z.string().trim().min(1, "El tipo de documento es requerido.").max(10),
  numeroDocumento: z.string().trim().min(1, "El número de documento es requerido.").max(20),
});

const inputSchema = z.object({
  dteDocumentId: z.string().uuid("El ID del documento DTE debe ser un UUID válido."),
  invalidationTypeCode: z.enum(["1", "2", "3"], {
    errorMap: () => ({ message: "El tipo de anulación debe ser 1, 2 o 3." }),
  }),
  reason: z.string().trim().max(500).nullable().optional(),
  responsable: personaSchema,
  solicita:    personaSchema,
});

export type CreateSignTransmitInvalidationInput = z.infer<typeof inputSchema>;

// ── Resultado ─────────────────────────────────────────────────────

export type CreateSignTransmitInvalidationResult =
  | {
      ok:              true;
      invalidationEventId: string;
      eventStatus:     "ACCEPTED" | "REJECTED";
      dteStatus:       "INVALIDATED" | "ACCEPTED";
      selloRecibido:   string | null;
      codigoMsg:       string | null;
      descripcionMsg:  string | null;
    }
  | { ok: false; error: string; stepFailed?: string };

// ── Action ────────────────────────────────────────────────────────

export async function createSignTransmitInvalidationAction(
  rawInput: CreateSignTransmitInvalidationInput,
): Promise<CreateSignTransmitInvalidationResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

  // PASO 6A: blindaje de solo lectura — bloquea ANTES de crear/firmar/
  // transmitir cualquier evento de invalidación. No toca la lógica de
  // invalidación en sí (createInvalidationEvent/signInvalidationEvent/
  // transmitInvalidationEvent quedan intactos).
  if (await isRuntimeReadOnlyActive()) {
    return { ok: false, error: RUNTIME_READONLY_MESSAGE };
  }

  try {
    const commercialCtx = await resolveCommercialEnforcementContext(tenant_id);
    assertOrganizationModule(commercialCtx, "fiscal.dte");
  } catch (err) {
    if (err instanceof CommercialEnforcementError) return { ok: false, error: err.userMessage };
    throw err;
  }

  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { ok: false, error: first ?? "Datos de invalidación no válidos." };
  }

  const { dteDocumentId, invalidationTypeCode, reason, responsable, solicita } = parsed.data;
  const ctx = {
    userId:     sessionUser.id,
    tenantId:   tenant_id,
    locationId: location_id,
  };

  // 1. Crear evento de invalidación en DRAFT
  const createResult = await createInvalidationEvent({
    dteDocumentId,
    invalidationTypeCode,
    reason:                    reason ?? null,
    replacementGenerationCode: null,
    responsable,
    solicita,
    ...ctx,
  });
  if (!createResult.ok) {
    return { ok: false, error: createResult.message, stepFailed: "crear_evento" };
  }
  const { invalidationEventId } = createResult;

  // 2. Firmar evento (DRAFT → SIGNED)
  const signResult = await signInvalidationEvent({
    invalidationEventId,
    ...ctx,
  });
  if (!signResult.ok) {
    return { ok: false, error: signResult.error, stepFailed: "firmar_evento" };
  }

  // 3. Transmitir a Hacienda (SIGNED → ACCEPTED | REJECTED)
  const transmitResult = await transmitInvalidationEvent({
    invalidationEventId,
    ...ctx,
  });
  if (!transmitResult.ok) {
    return { ok: false, error: transmitResult.error, stepFailed: "transmitir_evento" };
  }

  revalidatePath("/dashboard/sales");
  revalidatePath("/dashboard/dte/outgoing");

  // Si el evento fue ACCEPTED por MH, el DTE queda INVALIDATED; si REJECTED, vuelve a ACCEPTED
  const dteStatus: "INVALIDATED" | "ACCEPTED" =
    transmitResult.eventStatus === "ACCEPTED" ? "INVALIDATED" : "ACCEPTED";

  return {
    ok:                  true,
    invalidationEventId,
    eventStatus:         transmitResult.eventStatus,
    dteStatus,
    selloRecibido:       transmitResult.selloRecibido  ?? null,
    codigoMsg:           transmitResult.codigoMsg      ?? null,
    descripcionMsg:      transmitResult.descripcionMsg ?? null,
  };
}
