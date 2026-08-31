"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-and-transmit-credit-note.action.ts
//
// Orquestador completo de Nota de Crédito NC 05.
// Flujo en un solo paso desde el frontend:
//   CCFE 03 ACCEPTED → crear NC → generar JSON → validar schema
//     → firmar → transmitir a MH → ACCEPTED | REJECTED
//
// Reglas críticas:
//   - Nunca devuelve signed_jws, json_document completo ni tokens.
//   - Si cualquier paso falla, se detiene y devuelve el error.
//   - El DTE NC queda en el estado alcanzado, no se revierte.
//   - Permiso: requireAdmin.
// ─────────────────────────────────────────────────────────────────

import { z }                             from "zod";
import { revalidatePath }                from "next/cache";
import { requireAdmin }                  from "@/lib/permissions/guards";
import { getEffectiveLocationId }        from "@/lib/location/active-location";
import { createCreditNoteDteFromAcceptedCcfe } from "../services/create-credit-note-dte.service";
import { generateNcJsonForDte }          from "../services/generate-nc-json.service";
import { validateDteJsonSchema }         from "../services/validate-dte-json-schema.service";
import { signDteDocument }               from "../services/sign-dte-document.service";
import { transmitDteDocument }           from "../services/transmit-dte-document.service";
import { isRuntimeReadOnlyActive, RUNTIME_READONLY_MESSAGE } from "@/modules/platform/runtime/runtime-session";

// ── Input ─────────────────────────────────────────────────────────

const inputSchema = z.object({
  sourceDteDocumentId: z.string().uuid("El ID del documento fuente debe ser un UUID válido."),
  reasonText: z.string().trim().min(3, "El motivo debe tener al menos 3 caracteres.").max(500),
  reasonCode: z.string().trim().min(1).max(20).optional(),
});

export type CreateAndTransmitCreditNoteInput = z.infer<typeof inputSchema>;

// ── Resultado ─────────────────────────────────────────────────────

export type CreateAndTransmitCreditNoteResult =
  | {
      ok:              true;
      creditNoteDteId: string;
      controlNumber:   string;
      generationCode:  string;
      finalStatus:     "ACCEPTED" | "OBSERVED" | "REJECTED";
      selloRecibido:   string | null;
      descripcionMsg:  string | null;
    }
  | { ok: false; error: string; stepFailed?: string };

// ── Action ────────────────────────────────────────────────────────

export async function createAndTransmitCreditNoteAction(
  rawInput: CreateAndTransmitCreditNoteInput,
): Promise<CreateAndTransmitCreditNoteResult> {
  const sessionUser = await requireAdmin();
  const tenant_id   = sessionUser.tenant_id;
  const location_id = await getEffectiveLocationId(sessionUser);

  if (!tenant_id)   return { ok: false, error: "La sesión no tiene un tenant activo." };
  if (!location_id) return { ok: false, error: "La sesión no tiene una location activa." };

  // PASO 6A: blindaje de solo lectura — bloquea ANTES de crear/generar/
  // firmar/transmitir la nota de crédito. No toca la lógica de emisión
  // (createCreditNoteDteFromAcceptedCcfe/generateNcJsonForDte/
  // validateDteJsonSchema/signDteDocument/transmitDteDocument intactos).
  if (await isRuntimeReadOnlyActive()) {
    return { ok: false, error: RUNTIME_READONLY_MESSAGE };
  }

  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { ok: false, error: first ?? "Datos no válidos." };
  }

  const { sourceDteDocumentId, reasonText, reasonCode } = parsed.data;
  const ctx = { userId: sessionUser.id, tenantId: tenant_id, locationId: location_id };

  // 1. Crear NC 05 en PENDING_GENERATION
  const createResult = await createCreditNoteDteFromAcceptedCcfe({
    sourceDteDocumentId,
    reasonText,
    reasonCode,
    ...ctx,
  });
  if (!createResult.ok) {
    return { ok: false, error: createResult.message, stepFailed: "crear_nc" };
  }
  const { creditNoteDteId, controlNumber, generationCode } = createResult;

  // 2. Generar JSON NC 05 (PENDING_GENERATION → GENERATED)
  const generateResult = await generateNcJsonForDte({ dteDocumentId: creditNoteDteId, ...ctx });
  if (!generateResult.ok) {
    return { ok: false, error: generateResult.message, stepFailed: "generar_json" };
  }

  // 3. Validar schema MH (GENERATED → SCHEMA_VALIDATED)
  const validateResult = await validateDteJsonSchema(
    creditNoteDteId,
    tenant_id,
    location_id,
    sessionUser.id,
  );
  if (!validateResult.ok) {
    const errMsg = validateResult.validation_errors?.length
      ? `Schema inválido: ${validateResult.validation_errors[0].message}`
      : (validateResult.error ?? "Error de validación de schema.");
    return { ok: false, error: errMsg, stepFailed: "validar_schema" };
  }

  // 4. Firmar DTE (SCHEMA_VALIDATED → SIGNED)
  const signResult = await signDteDocument({ dteDocumentId: creditNoteDteId, ...ctx });
  if (!signResult.ok) {
    return { ok: false, error: signResult.error, stepFailed: "firmar" };
  }

  // 5. Transmitir a Hacienda (SIGNED → ACCEPTED | OBSERVED | REJECTED)
  const transmitResult = await transmitDteDocument({ dteDocumentId: creditNoteDteId, ...ctx });
  if (!transmitResult.ok) {
    return { ok: false, error: transmitResult.error, stepFailed: "transmitir" };
  }

  revalidatePath("/dashboard/sales");
  revalidatePath("/dashboard/dte/outgoing");

  return {
    ok:              true,
    creditNoteDteId,
    controlNumber,
    generationCode,
    finalStatus:     transmitResult.dteStatus,
    selloRecibido:   transmitResult.selloRecibido  ?? null,
    descripcionMsg:  transmitResult.descripcionMsg ?? null,
  };
}
