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
//
// FASE VI-E6B — reemplaza requireAdmin + getEffectiveLocationId +
// resolveCommercialEnforcementContext + isRuntimeReadOnlyActive manual
// por requireOperationalContext (mismo patrón certificado en VI-E3/E4/
// E5/E6A). El guard de solo lectura para Support Session ahora lo
// aplica requireOperationalContext internamente (write:true -> READ_ONLY
// antes de crear/firmar/transmitir nada), reemplazando el chequeo
// manual isRuntimeReadOnlyActive() previo — mismo comportamiento, una
// sola fuente de verdad. Los tres pasos (create/sign/transmit) reciben
// context.client explícito para que TODO el flujo corra en la MISMA
// runtime DB para RUNTIME_CLIENT.
// ─────────────────────────────────────────────────────────────────

import { z }                              from "zod";
import { revalidatePath }                 from "next/cache";
import { requireAdmin }                   from "@/lib/permissions/guards";
import { createInvalidationEvent }        from "../services/create-invalidation-event.service";
import { signInvalidationEvent }          from "../services/sign-invalidation-event.service";
import { transmitInvalidationEvent }      from "../services/transmit-invalidation-event.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

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

  let handle;
  try {
    // write:true -> READ_ONLY (Support Session) rechaza ANTES de crear/
    // firmar/transmitir cualquier evento de invalidación, sin excepción.
    // module -> exige fiscal.dte habilitado (MODULE_DISABLED si no).
    handle = await requireOperationalContext(sessionUser, { module: "fiscal.dte", write: true });
  } catch (err) {
    if (err instanceof OperationalContextError) return { ok: false, error: err.userMessage };
    throw err;
  }
  const { context, dispose } = handle;

  try {
    if (!context.locationId) {
      return { ok: false, error: "La sesión no tiene una location activa." };
    }

    const parsed = inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
      return { ok: false, error: first ?? "Datos de invalidación no válidos." };
    }

    const { dteDocumentId, invalidationTypeCode, reason, responsable, solicita } = parsed.data;
    const ctx = {
      userId:     context.effectiveUser.id,
      tenantId:   context.tenantId,
      locationId: context.locationId,
    };

    // 1. Crear evento de invalidación en DRAFT — misma runtime DB
    //    (context.client) que el resto del flujo.
    const createResult = await createInvalidationEvent(
      {
        dteDocumentId,
        invalidationTypeCode,
        reason:                    reason ?? null,
        replacementGenerationCode: null,
        responsable,
        solicita,
        ...ctx,
      },
      context.client,
    );
    if (!createResult.ok) {
      return { ok: false, error: createResult.message, stepFailed: "crear_evento" };
    }
    const { invalidationEventId } = createResult;

    // 2. Firmar evento (DRAFT → SIGNED) — misma runtime DB.
    const signResult = await signInvalidationEvent(
      {
        invalidationEventId,
        ...ctx,
      },
      context.client,
    );
    if (!signResult.ok) {
      return { ok: false, error: signResult.error, stepFailed: "firmar_evento" };
    }

    // 3. Transmitir a Hacienda (SIGNED → ACCEPTED | REJECTED) — misma
    //    runtime DB.
    const transmitResult = await transmitInvalidationEvent(
      {
        invalidationEventId,
        ...ctx,
      },
      context.client,
    );
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
  } finally {
    await dispose();
  }
}
