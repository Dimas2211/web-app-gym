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
import { createCreditNoteDteFromAcceptedCcfe } from "../services/create-credit-note-dte.service";
import { generateNcJsonForDte }          from "../services/generate-nc-json.service";
import { validateDteJsonSchema }         from "../services/validate-dte-json-schema.service";
import { signDteDocument }               from "../services/sign-dte-document.service";
import { transmitDteDocument }           from "../services/transmit-dte-document.service";
import {
  requireOperationalContext,
  OperationalContextError,
} from "@/modules/platform/runtime/require-operational-context";

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

  // FASE VI-E4B: contexto operacional runtime reemplaza el blindaje manual
  // de solo lectura (isRuntimeReadOnlyActive) y el gate comercial manual —
  // ambos quedan cubiertos por requireOperationalContext({ write: true }).
  // createCreditNoteDteFromAcceptedCcfe/generateNcJsonForDte/
  // validateDteJsonSchema ahora corren en context.client (runtime DB para
  // RUNTIME_CLIENT).
  //
  // FASE VI-E5A: signDteDocument ahora también recibe context.client — el
  // paso de firma corre íntegramente en la runtime DB del tenant, igual
  // que los 3 pasos anteriores.
  //
  // FASE VI-E5B: transmitDteDocument ya es runtime-aware (acepta `db`
  // igual que sign/generate/validate/create) — carga el documento
  // firmado, resuelve IssuerConfig/DteCredential y persiste
  // DteTransmissionLog/ledger de metering en la MISMA runtime DB vía
  // context.client. El flujo combinado ya no se detiene después de
  // firmar: RUNTIME_CLIENT llega hasta la transmisión igual que
  // PLATFORM_NATIVE, ambos usando el mismo transmitDteDocument
  // runtime-aware (sin duplicar implementación).
  let handle;
  try {
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
      return { ok: false, error: first ?? "Datos no válidos." };
    }

    const { sourceDteDocumentId, reasonText, reasonCode } = parsed.data;
    const ctx = {
      userId:     context.effectiveUser.id,
      tenantId:   context.tenantId,
      locationId: context.locationId,
    };

    // 1. Crear NC 05 en PENDING_GENERATION
    const createResult = await createCreditNoteDteFromAcceptedCcfe(
      { sourceDteDocumentId, reasonText, reasonCode, ...ctx },
      context.client,
    );
    if (!createResult.ok) {
      return { ok: false, error: createResult.message, stepFailed: "crear_nc" };
    }
    const { creditNoteDteId, controlNumber, generationCode } = createResult;

    // 2. Generar JSON NC 05 (PENDING_GENERATION → GENERATED)
    const generateResult = await generateNcJsonForDte(
      { dteDocumentId: creditNoteDteId, ...ctx },
      context.client,
    );
    if (!generateResult.ok) {
      return { ok: false, error: generateResult.message, stepFailed: "generar_json" };
    }

    // 3. Validar schema MH (GENERATED → SCHEMA_VALIDATED)
    const validateResult = await validateDteJsonSchema(
      creditNoteDteId,
      context.tenantId,
      context.locationId,
      context.effectiveUser.id,
      context.client,
    );
    if (!validateResult.ok) {
      const errMsg = validateResult.validation_errors?.length
        ? `Schema inválido: ${validateResult.validation_errors[0].message}`
        : (validateResult.error ?? "Error de validación de schema.");
      return { ok: false, error: errMsg, stepFailed: "validar_schema" };
    }

    // 4. Firmar DTE (SCHEMA_VALIDATED → SIGNED) — VI-E5A: corre en
    //    context.client (runtime DB del tenant para RUNTIME_CLIENT).
    const signResult = await signDteDocument({ dteDocumentId: creditNoteDteId, ...ctx }, context.client);
    if (!signResult.ok) {
      return { ok: false, error: signResult.error, stepFailed: "firmar" };
    }

    // 5. Transmitir a Hacienda (SIGNED → ACCEPTED | OBSERVED | REJECTED) —
    //    VI-E5B: corre en context.client (runtime DB del tenant para
    //    RUNTIME_CLIENT), mismo transmitDteDocument runtime-aware usado
    //    por transmit-dte-document.action.ts.
    const transmitResult = await transmitDteDocument({ dteDocumentId: creditNoteDteId, ...ctx }, context.client);
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
  } finally {
    await dispose();
  }
}
