// ─────────────────────────────────────────────────────────────────
// commerce/dte — sign-contingency-event.service.ts
//
// signContingencyEvent — firma un DteContingencyEvent en estado
// PENDING_SIGNATURE.
//
// Reglas:
//   - Solo opera sobre DteContingencyEvent.status === "PENDING_SIGNATURE".
//   - event_json debe existir y signed_jws debe ser null.
//   - Resuelve firmador + credenciales vía resolveDteSignerConfigForIssuer
//     (issuer_config_id → DteCredential por emisor/ambiente; si no hay
//     credencial de emisor utilizable, cae a DTE_SIGNER_NIT/PASSWORD +
//     DTE_SIGNER_URL_TEST/PRODUCTION global). Ver dte-credential.service.ts.
//   - Si firma bien: status → SIGNED, guarda signed_jws.
//   - Si falla: mantiene PENDING_SIGNATURE.
//   - Registra DteTransmissionLog con operation_type = "CONTINGENCY_SIGN".
//   - NO transmite. NO toca DteOutgoingDocument. NO toca schema.
//
// FASE VI-E6C — acepta un `db` explícito (PrismaClient runtime), mismo
// patrón que sign-invalidation-event.service.ts (VI-E6B). Con `db`, TODA
// lectura/escritura tenant-owned (DteContingencyEvent, DteOutgoingDocument,
// DteCredential vía resolveDteSignerConfigForIssuer, DteTransmissionLog)
// corre en la MISMA runtime DB. Sin `db`, cae al Prisma global
// (comportamiento legacy para callers PLATFORM_NATIVE no migrados). Se
// reemplaza la resolución de credenciales exclusivamente por env
// (DTE_SIGNER_NIT/PASSWORD) por resolveDteSignerConfigForIssuer, que ya
// es runtime-aware y reusa el mecanismo certificado en VI-E5A/VI-E6B.
// ─────────────────────────────────────────────────────────────────

import { type Prisma, type PrismaClient } from "@prisma/client";
import { prisma }                 from "@/lib/db/prisma";
import { DteSignerConfigError }   from "../config/dte-signer.config";
import { resolveDteSignerConfigForIssuer } from "./dte-credential.service";
import { MhHttpDteSignerAdapter } from "../adapters/dte-signer.adapter";
import type { DteMhEnvironment }  from "../types/dte-mh-auth.types";

// ── Tipos públicos ────────────────────────────────────────────────

export interface SignContingencyEventParams {
  contingencyEventId: string;
  tenantId:           string;
  locationId:         string;
}

export type SignContingencyEventResult =
  | { ok: true;  status: "SIGNED"; signedAt: string }
  | { ok: false; error: string };

// ── Error de negocio interno ────────────────────────────────────────

class SignContingencyBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignContingencyBusinessError";
  }
}

// ── Función principal ─────────────────────────────────────────────

export async function signContingencyEvent(
  params: SignContingencyEventParams,
  db: PrismaClient = prisma,
): Promise<SignContingencyEventResult> {
  const { contingencyEventId, tenantId, locationId } = params;

  try {
    // 1. Cargar evento con scope tenant/location
    const event = await db.dteContingencyEvent.findFirst({
      where: { id: contingencyEventId, tenant_id: tenantId, location_id: locationId },
      select: {
        id:         true,
        status:     true,
        event_json: true,
        signed_jws: true,
        items:      {
          select: {
            dte_document_id: true,
            dte_document: { select: { environment: true, issuer_config_id: true } },
          },
          take:   1,
        },
      },
    });

    if (!event) {
      throw new SignContingencyBusinessError(
        "El Evento de Contingencia no existe o no pertenece a la location activa.",
      );
    }

    // 2. Validar precondiciones
    if (event.status !== "PENDING_SIGNATURE") {
      throw new SignContingencyBusinessError(
        `Solo se pueden firmar eventos en estado PENDING_SIGNATURE. Estado actual: "${event.status}".`,
      );
    }
    if (!event.event_json) {
      throw new SignContingencyBusinessError(
        "El Evento de Contingencia no tiene event_json generado.",
      );
    }
    if (event.signed_jws !== null) {
      throw new SignContingencyBusinessError(
        "El Evento de Contingencia ya tiene un JWS firmado.",
      );
    }
    if (event.items.length === 0 || !event.items[0]?.dte_document_id) {
      throw new SignContingencyBusinessError(
        "El Evento de Contingencia no tiene documentos DTE asociados — no se puede registrar el log de firma.",
      );
    }

    // 3. Resolver firmador + credenciales — mismo mecanismo certificado
    //    que sign-invalidation-event.service.ts (VI-E6B). `client: db` —
    //    misma runtime DB que el evento y el documento.
    const environment = event.items[0]?.dte_document.environment as DteMhEnvironment;
    const issuerConfigId = event.items[0]?.dte_document.issuer_config_id ?? undefined;

    const signerResolution = await resolveDteSignerConfigForIssuer({
      issuerConfigId,
      environment,
      client: db,
    });

    if (!signerResolution.ok) {
      throw new SignContingencyBusinessError(signerResolution.error);
    }

    const { config: signerConfig, nit, passwordPri } = signerResolution;
    const { signerUrl } = signerConfig;

    // 4. Parsear event_json (Prisma Json puede venir como objeto o string)
    let dteJson: unknown;
    try {
      dteJson =
        typeof event.event_json === "string"
          ? JSON.parse(event.event_json as string)
          : event.event_json;
    } catch {
      throw new SignContingencyBusinessError(
        "El event_json almacenado no es parseable. El evento puede estar corrupto.",
      );
    }

    // 5. Llamar al firmador ya resuelto en el paso 3.
    const adapter        = new MhHttpDteSignerAdapter();
    const signerResult   = await adapter.sign({ nit, passwordPri, dteJson }, signerConfig);

    const signedAt      = new Date();
    const refDocumentId = event.items[0].dte_document_id;

    if (signerResult.ok) {
      // 6a. Firma exitosa → SIGNED + log
      await db.$transaction([
        db.dteContingencyEvent.update({
          where: { id: contingencyEventId },
          data:  { status: "SIGNED", signed_jws: signerResult.signedJws },
        }),
        db.dteTransmissionLog.create({
          data: {
            dte_document_id: refDocumentId,
            attempt_number:  1,
            operation_type:  "CONTINGENCY_SIGN",
            request_url:     signerUrl,
            // No guardar signed_jws en el log — solo status confirmatorio
            response_body:   {
              status:              "OK",
              contingencyEventId,
            } as Prisma.InputJsonValue,
          },
        }),
      ]);

      return { ok: true, status: "SIGNED", signedAt: signedAt.toISOString() };
    } else {
      // 6b. Firma fallida → mantiene PENDING_SIGNATURE, registra log
      const httpStatus = signerResult.httpStatus ?? null;

      await db.dteTransmissionLog.create({
        data: {
          dte_document_id: refDocumentId,
          attempt_number:  1,
          operation_type:  "CONTINGENCY_SIGN",
          request_url:     signerUrl,
          http_status:     httpStatus,
          error_message:   signerResult.message,
          response_body:   {
            errorCode:          signerResult.errorCode,
            message:            signerResult.message,
            httpStatus,
            contingencyEventId,
          } as Prisma.InputJsonValue,
        },
      });

      return { ok: false, error: signerResult.message };
    }

  } catch (err) {
    if (err instanceof SignContingencyBusinessError || err instanceof DteSignerConfigError) {
      return { ok: false, error: err.message };
    }
    console.error("[signContingencyEvent] Error inesperado:", err);
    return { ok: false, error: "Error interno al firmar el Evento de Contingencia." };
  }
}
