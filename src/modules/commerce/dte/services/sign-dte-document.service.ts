// ─────────────────────────────────────────────────────────────────
// commerce/dte — sign-dte-document.service.ts
//
// Firma un DteOutgoingDocument en estado SCHEMA_VALIDATED usando el
// firmador oficial MH (svfe-api-firmador).
//
// Reglas:
//   - Solo opera sobre dte_status === "SCHEMA_VALIDATED".
//   - Lee credenciales de DTE_SIGNER_NIT y DTE_SIGNER_PASSWORD (env).
//   - Si firma bien: dte_status → SIGNED, guarda signed_jws y signed_at.
//   - Si falla: mantiene SCHEMA_VALIDATED, incrementa retry_count.
//   - Registra DteTransmissionLog en ambos casos.
//   - NO transmite a Hacienda. NO modifica schema.prisma.
// ─────────────────────────────────────────────────────────────────

import { prisma }                 from "@/lib/db/prisma";
import { getDteSignerConfig }     from "../config/dte-signer.config";
import { MhHttpDteSignerAdapter } from "../adapters/dte-signer.adapter";

// ── Tipos públicos ────────────────────────────────────────────────

export interface SignDteDocumentParams {
  dteDocumentId: string;
  userId:        string;
  tenantId:      string;
  locationId:    string;
}

export type SignDteDocumentResult =
  | { ok: true;  dteStatus: "SIGNED"; signedAt: string }
  | { ok: false; error: string };

// ── Error de negocio interno ──────────────────────────────────────

class SignDteBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignDteBusinessError";
  }
}

// ── Estados que bloquean la firma ─────────────────────────────────

const BLOCKED_STATUSES = new Set([
  "GENERATED",
  "SIGNED",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "OBSERVED",
  "INVALIDATED",
]);

// ── Función principal ─────────────────────────────────────────────

export async function signDteDocument(
  params: SignDteDocumentParams,
): Promise<SignDteDocumentResult> {
  const { dteDocumentId, userId, tenantId, locationId } = params;

  try {
    // 1. Cargar documento con validación tenant/location
    const dteDoc = await prisma.dteOutgoingDocument.findFirst({
      where:  { id: dteDocumentId, tenant_id: tenantId, location_id: locationId },
      select: {
        id:            true,
        dte_status:    true,
        json_document: true,
        signed_jws:    true,
        retry_count:   true,
      },
    });

    if (!dteDoc) {
      throw new SignDteBusinessError(
        "El documento DTE no existe o no pertenece a la location activa.",
      );
    }

    // 2. Estado debe ser SCHEMA_VALIDATED
    if (dteDoc.dte_status !== "SCHEMA_VALIDATED") {
      if (BLOCKED_STATUSES.has(dteDoc.dte_status)) {
        throw new SignDteBusinessError(
          `Solo se pueden firmar documentos validados contra schema. Estado actual: ${dteDoc.dte_status}.`,
        );
      }
      throw new SignDteBusinessError(
        "Solo se pueden firmar documentos validados contra schema.",
      );
    }

    // 3. json_document debe existir
    if (!dteDoc.json_document) {
      throw new SignDteBusinessError(
        "El documento DTE no tiene JSON generado. Genera y valida el JSON antes de firmar.",
      );
    }

    // 4. Credenciales desde variables de entorno
    const rawNit      = process.env["DTE_SIGNER_NIT"];
    const passwordPri = process.env["DTE_SIGNER_PASSWORD"];

    if (!rawNit || !passwordPri) {
      throw new SignDteBusinessError(
        "Credenciales del firmador DTE no configuradas.",
      );
    }

    const nit = rawNit.replace(/-/g, "");

    // 5. Parsear json_document (Prisma Json puede venir como objeto o string)
    let dteJson: unknown;
    try {
      dteJson =
        typeof dteDoc.json_document === "string"
          ? JSON.parse(dteDoc.json_document as string)
          : dteDoc.json_document;
    } catch {
      throw new SignDteBusinessError(
        "El JSON almacenado no es parseable. El documento puede estar corrupto.",
      );
    }

    // 6. Llamar al firmador
    const { signerUrl } = getDteSignerConfig();
    const adapter       = new MhHttpDteSignerAdapter();
    const attemptNumber = dteDoc.retry_count + 1;

    const signerResult = await adapter.sign({ nit, passwordPri, dteJson });

    if (signerResult.ok) {
      // 7. Firma exitosa → actualizar a SIGNED en transacción con log
      const signedAt = signerResult.signedAt;

      await prisma.$transaction([
        prisma.dteOutgoingDocument.update({
          where: { id: dteDocumentId },
          data:  {
            dte_status: "SIGNED",
            signed_jws: signerResult.signedJws,
            signed_at:  signedAt,
            updated_by: userId,
          },
        }),
        prisma.dteTransmissionLog.create({
          data: {
            dte_document_id: dteDocumentId,
            attempt_number:  attemptNumber,
            operation_type:  "SIGN",
            request_url:     signerUrl,
            // No guardar signed_jws en el log — solo status confirmatorio
            response_body:   { status: "OK" },
          },
        }),
      ]);

      return {
        ok:        true,
        dteStatus: "SIGNED",
        signedAt:  signedAt.toISOString(),
      };
    } else {
      // 8. Firma fallida → mantener SCHEMA_VALIDATED, incrementar retry_count
      const httpStatus = signerResult.httpStatus ?? null;

      await prisma.$transaction([
        prisma.dteOutgoingDocument.update({
          where: { id: dteDocumentId },
          data:  {
            retry_count: { increment: 1 },
            updated_by:  userId,
          },
        }),
        prisma.dteTransmissionLog.create({
          data: {
            dte_document_id: dteDocumentId,
            attempt_number:  attemptNumber,
            operation_type:  "SIGN",
            request_url:     signerUrl,
            http_status:     httpStatus,
            error_message:   signerResult.message,
            response_body:   {
              errorCode:  signerResult.errorCode,
              message:    signerResult.message,
              httpStatus: httpStatus,
            },
          },
        }),
      ]);

      return { ok: false, error: signerResult.message };
    }

  } catch (error) {
    if (error instanceof SignDteBusinessError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
