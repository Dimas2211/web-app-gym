// ─────────────────────────────────────────────────────────────────
// commerce/dte — sign-invalidation-event.service.ts
//
// signInvalidationEvent — firma un DteInvalidationEvent en estado DRAFT.
//
// Reglas:
//   - Solo opera sobre DteInvalidationEvent en status === "DRAFT".
//   - event_json debe existir y signed_jws debe ser null.
//   - DteOutgoingDocument relacionado debe seguir en ACCEPTED.
//   - Resuelve firmador + credenciales vía resolveDteSignerConfigForIssuer
//     (issuer_config_id → DteCredential por emisor/ambiente; si no hay
//     credencial de emisor utilizable, cae a DTE_SIGNER_NIT/PASSWORD +
//     DTE_SIGNER_URL_TEST/PRODUCTION global). Ver dte-credential.service.ts.
//   - Si firma bien: status → SIGNED, guarda signed_jws.
//   - Si falla: mantiene DRAFT, guarda last_error.
//   - Registra DteTransmissionLog con operation_type = "INVALIDATE_SIGN".
//   - NO modifica DteOutgoingDocument. NO transmite. NO toca schema.
//
// FASE VI-E6B — acepta un `db` explícito (PrismaClient runtime), mismo
// patrón que sign-dte-document.service.ts (VI-E5A). Con `db`, TODA
// lectura/escritura tenant-owned (DteInvalidationEvent, DteOutgoingDocument,
// DteIssuerConfig, DteCredential vía resolveDteSignerConfigForIssuer,
// DteTransmissionLog) corre en la MISMA runtime DB. Sin `db`, cae al
// Prisma global (comportamiento legacy para callers PLATFORM_NATIVE no
// migrados). Se reemplaza la resolución de credenciales exclusivamente
// por env (DTE_SIGNER_NIT/PASSWORD) por resolveDteSignerConfigForIssuer,
// que ya es runtime-aware y reusa el mecanismo certificado en VI-E5A —
// nunca cruza ambientes ni bases físicas.
// ─────────────────────────────────────────────────────────────────

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma }                 from "@/lib/db/prisma";
import { DteSignerConfigError }   from "../config/dte-signer.config";
import { resolveDteSignerConfigForIssuer } from "./dte-credential.service";
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
  db: PrismaClient = prisma,
): Promise<SignInvalidationEventResult> {
  const { invalidationEventId, userId: _userId, tenantId, locationId } = params;

  try {
    // 1. Cargar DteInvalidationEvent con scope tenant/location
    const invEvent = await db.dteInvalidationEvent.findFirst({
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

    // 3. Cargar DteOutgoingDocument relacionado — misma runtime DB,
    //    mismo tenant/location que el evento (VI-E6B / F, H).
    const dteDoc = await db.dteOutgoingDocument.findFirst({
      where:  { id: invEvent.dte_document_id, tenant_id: tenantId, location_id: locationId },
      select: { id: true, dte_status: true, environment: true, issuer_config_id: true },
    });

    if (!dteDoc) {
      throw new SignInvalidationBusinessError(
        "El documento DTE relacionado no existe o no pertenece a la location activa.",
      );
    }

    // 4. DTE original debe seguir ACCEPTED — no se modifica aquí
    if (dteDoc.dte_status !== "ACCEPTED") {
      throw new SignInvalidationBusinessError(
        `El documento DTE original debe estar en estado ACCEPTED. Estado actual: "${dteDoc.dte_status}".`,
      );
    }

    // 4b. Consistencia de ambiente documento <-> emisor (VI-E6B / I, J).
    //     Se carga desde el mismo `db` (misma runtime DB que el
    //     documento) y se rechaza explícitamente cualquier mezcla
    //     TEST/PRODUCTION antes de llamar al firmador.
    if (dteDoc.issuer_config_id) {
      const issuerConfig = await db.dteIssuerConfig.findFirst({
        where:  { id: dteDoc.issuer_config_id, tenant_id: tenantId, location_id: locationId },
        select: { environment: true },
      });
      if (!issuerConfig) {
        throw new SignInvalidationBusinessError(
          "La configuración del emisor del documento no existe o no pertenece a la location activa.",
        );
      }
      if (issuerConfig.environment !== dteDoc.environment) {
        throw new SignInvalidationBusinessError(
          "El ambiente del emisor no coincide con el ambiente del documento DTE. Firma de invalidación bloqueada.",
        );
      }
    }

    // 5. Resolver firmador + credenciales — mismo mecanismo certificado
    //    que sign-dte-document.service.ts (VI-E5A). `client: db` —
    //    misma runtime DB que el documento y el evento (VI-E6B / H, J).
    const signerResolution = await resolveDteSignerConfigForIssuer({
      issuerConfigId: dteDoc.issuer_config_id,
      environment:    dteDoc.environment as DteMhEnvironment,
      client:         db,
    });

    if (!signerResolution.ok) {
      throw new SignInvalidationBusinessError(signerResolution.error);
    }

    const { config: resolvedSignerConfig, nit, passwordPri } = signerResolution;

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

    // 7. Llamar al firmador ya resuelto en el paso 5.
    const { signerUrl } = resolvedSignerConfig;
    const adapter       = new MhHttpDteSignerAdapter();
    const signerResult  = await adapter.sign({ nit, passwordPri, dteJson }, resolvedSignerConfig);

    const signedAt = new Date();

    if (signerResult.ok) {
      // 8a. Firma exitosa → actualizar a SIGNED en transacción con log
      await db.$transaction([
        db.dteInvalidationEvent.update({
          where: { id: invalidationEventId },
          data:  {
            status:     "SIGNED",
            signed_jws: signerResult.signedJws,
            last_error: null,
          },
        }),
        db.dteTransmissionLog.create({
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

      await db.$transaction([
        db.dteInvalidationEvent.update({
          where: { id: invalidationEventId },
          data:  {
            last_error: signerResult.message,
          },
        }),
        db.dteTransmissionLog.create({
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
