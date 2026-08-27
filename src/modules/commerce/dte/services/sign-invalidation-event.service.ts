// ─────────────────────────────────────────────────────────────────
// commerce/dte — sign-invalidation-event.service.ts
//
// signInvalidationEvent — firma un DteInvalidationEvent en estado DRAFT.
//
// Reglas:
//   - Solo opera sobre DteInvalidationEvent en status === "DRAFT".
//   - event_json debe existir y signed_jws debe ser null.
//   - DteOutgoingDocument relacionado debe seguir en ACCEPTED.
//   - Lee credenciales de DTE_SIGNER_NIT y DTE_SIGNER_PASSWORD (env).
//   - Si firma bien: status → SIGNED, guarda signed_jws.
//   - Si falla: mantiene DRAFT, guarda last_error.
//   - Registra DteTransmissionLog con operation_type = "INVALIDATE_SIGN".
//   - NO modifica DteOutgoingDocument. NO transmite. NO toca schema.
// ─────────────────────────────────────────────────────────────────

import { type Prisma } from "@prisma/client";
import { prisma }                 from "@/lib/db/prisma";
import { resolveDteSignerConfig, DteSignerConfigError } from "../config/dte-signer.config";
import { MhHttpDteSignerAdapter } from "../adapters/dte-signer.adapter";
import type { DteMhEnvironment }  from "../types/dte-mh-auth.types";

// ── Tipos públicos ────────────────────────────────────────────────

export interface SignInvalidationEventParams {
  invalidationEventId: string;
  userId:              string;
  tenantId:            string;
  locationId:          string;
}

export type SignInvalidationEventResult =
  | { ok: true;  status: "SIGNED"; signedAt: string }
  | { ok: false; error: string };

// ── Error de negocio interno ──────────────────────────────────────

class SignInvalidationBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignInvalidationBusinessError";
  }
}

// ── Función principal ─────────────────────────────────────────────

export async function signInvalidationEvent(
  params: SignInvalidationEventParams,
): Promise<SignInvalidationEventResult> {
  const { invalidationEventId, userId: _userId, tenantId, locationId } = params;

  try {
    // 1. Cargar DteInvalidationEvent con scope tenant/location
    const invEvent = await prisma.dteInvalidationEvent.findFirst({
      where: {
        id:          invalidationEventId,
        tenant_id:   tenantId,
        location_id: locationId,
      },
      select: {
        id:              true,
        status:          true,
        event_json:      true,
        signed_jws:      true,
        dte_document_id: true,
      },
    });

    if (!invEvent) {
      throw new SignInvalidationBusinessError(
        "El evento de invalidación no existe o no pertenece a la location activa.",
      );
    }

    // 2. Validar precondiciones
    if (invEvent.status !== "DRAFT") {
      throw new SignInvalidationBusinessError(
        `Solo se pueden firmar eventos en estado DRAFT. Estado actual: "${invEvent.status}".`,
      );
    }

    if (!invEvent.event_json) {
      throw new SignInvalidationBusinessError(
        "El evento de invalidación no tiene event_json generado.",
      );
    }

    if (invEvent.signed_jws !== null) {
      throw new SignInvalidationBusinessError(
        "El evento de invalidación ya tiene un JWS firmado.",
      );
    }

    if (!invEvent.dte_document_id) {
      throw new SignInvalidationBusinessError(
        "El evento de invalidación no tiene dte_document_id.",
      );
    }

    // 3. Cargar DteOutgoingDocument relacionado
    const dteDoc = await prisma.dteOutgoingDocument.findFirst({
      where:  { id: invEvent.dte_document_id },
      select: { id: true, dte_status: true, environment: true },
    });

    if (!dteDoc) {
      throw new SignInvalidationBusinessError(
        "El documento DTE relacionado no existe.",
      );
    }

    // 4. DTE original debe seguir ACCEPTED — no se modifica aquí
    if (dteDoc.dte_status !== "ACCEPTED") {
      throw new SignInvalidationBusinessError(
        `El documento DTE original debe estar en estado ACCEPTED. Estado actual: "${dteDoc.dte_status}".`,
      );
    }

    // 5. Credenciales del firmador desde env
    const rawNit      = process.env["DTE_SIGNER_NIT"];
    const passwordPri = process.env["DTE_SIGNER_PASSWORD"];

    if (!rawNit || !passwordPri) {
      throw new SignInvalidationBusinessError(
        "Credenciales del firmador DTE no configuradas (DTE_SIGNER_NIT / DTE_SIGNER_PASSWORD).",
      );
    }

    const nit = rawNit.replace(/-/g, "");

    // 6. Parsear event_json (Prisma Json puede venir como objeto o string)
    let dteJson: unknown;
    try {
      dteJson =
        typeof invEvent.event_json === "string"
          ? JSON.parse(invEvent.event_json as string)
          : invEvent.event_json;
    } catch {
      throw new SignInvalidationBusinessError(
        "El event_json almacenado no es parseable. El evento puede estar corrupto.",
      );
    }

    // 7. Resolver signer por el ambiente del DTE original y llamarlo.
    const signerConfig  = resolveDteSignerConfig(dteDoc.environment as DteMhEnvironment);
    const { signerUrl } = signerConfig;
    const adapter       = new MhHttpDteSignerAdapter();
    const signerResult  = await adapter.sign({ nit, passwordPri, dteJson }, signerConfig);

    const signedAt = new Date();

    if (signerResult.ok) {
      // 8a. Firma exitosa → actualizar a SIGNED en transacción con log
      await prisma.$transaction([
        prisma.dteInvalidationEvent.update({
          where: { id: invalidationEventId },
          data:  {
            status:     "SIGNED",
            signed_jws: signerResult.signedJws,
            last_error: null,
          },
        }),
        prisma.dteTransmissionLog.create({
          data: {
            dte_document_id: invEvent.dte_document_id,
            attempt_number:  1,
            operation_type:  "INVALIDATE_SIGN",
            request_url:     signerUrl,
            // No guardar signed_jws en el log — solo status confirmatorio
            response_body:   {
              status:              "OK",
              invalidationEventId,
            } as Prisma.InputJsonValue,
          },
        }),
      ]);

      return {
        ok:       true,
        status:   "SIGNED",
        signedAt: signedAt.toISOString(),
      };
    } else {
      // 8b. Firma fallida → mantener DRAFT, guardar last_error
      const httpStatus = signerResult.httpStatus ?? null;

      await prisma.$transaction([
        prisma.dteInvalidationEvent.update({
          where: { id: invalidationEventId },
          data:  {
            last_error: signerResult.message,
          },
        }),
        prisma.dteTransmissionLog.create({
          data: {
            dte_document_id: invEvent.dte_document_id,
            attempt_number:  1,
            operation_type:  "INVALIDATE_SIGN",
            request_url:     signerUrl,
            http_status:     httpStatus,
            error_message:   signerResult.message,
            response_body:   {
              errorCode:           signerResult.errorCode,
              message:             signerResult.message,
              httpStatus:          httpStatus,
              invalidationEventId,
            } as Prisma.InputJsonValue,
          },
        }),
      ]);

      return { ok: false, error: signerResult.message };
    }

  } catch (err) {
    if (err instanceof SignInvalidationBusinessError || err instanceof DteSignerConfigError) {
      return { ok: false, error: err.message };
    }
    console.error("[signInvalidationEvent] Error inesperado:", err);
    return {
      ok:    false,
      error: "Error interno al firmar el evento de invalidación.",
    };
  }
}
