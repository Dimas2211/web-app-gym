// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-invalidation-event.service.ts
//
// createInvalidationEvent — crea un DteInvalidationEvent en estado DRAFT.
//
// Reglas críticas:
//   - Solo opera sobre DteOutgoingDocument en estado ACCEPTED.
//   - Tipos DTE permitidos para invalidar: "01" (FE), "03" (CCFE), "05" (NC).
//   - Bloquea si ya existe un evento activo (DRAFT|PENDING_SIGNATURE|SIGNED|SENT|ACCEPTED).
//   - Genera eventGenerationCode con crypto.randomUUID().toUpperCase().
//   - Delega construcción/validación del JSON al builder (buildInvalidationEventJson).
//   - NO modifica DteOutgoingDocument — sigue ACCEPTED.
//   - NO firma. NO transmite. NO toca Prisma schema.
// ─────────────────────────────────────────────────────────────────

import { randomUUID }                   from "crypto";
import { type DteInvalidationStatus, Prisma } from "@prisma/client";
import { prisma }                       from "@/lib/db/prisma";
import { buildInvalidationEventJson }   from "./build-invalidation-event-json.service";
import type { InvalidationPersona }     from "../types/dte-invalidation-event-json.types";
import type { OriginalDteJsonDocument } from "../types/dte-invalidation-event-json.types";

// ── Tipos públicos ────────────────────────────────────────────────

export interface CreateInvalidationEventParams {
  dteDocumentId:             string;
  invalidationTypeCode:      "1" | "2" | "3";
  reason?:                   string | null;
  replacementGenerationCode?: string | null;
  responsable:               InvalidationPersona;
  solicita:                  InvalidationPersona;
  userId:                    string;
  tenantId:                  string;
  locationId:                string;
}

export type CreateInvalidationEventResult =
  | {
      ok:                   true;
      invalidationEventId:  string;
      dteDocumentId:        string;
      status:               "DRAFT";
      eventGenerationCode:  string;
    }
  | { ok: false; message: string };

// ── Estados que bloquean una nueva invalidación ───────────────────

const ACTIVE_INVALIDATION_STATUSES = new Set([
  "DRAFT",
  "PENDING_SIGNATURE",
  "SIGNED",
  "SENT",
  "ACCEPTED",
]);

// ── Tipos DTE que pueden invalidarse ─────────────────────────────

const INVALIDABLE_DTE_TYPES = new Set(["01", "03", "05"]);

// ── Error de negocio interno ──────────────────────────────────────

class InvalidationBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidationBusinessError";
  }
}

// ── Función principal ─────────────────────────────────────────────

export async function createInvalidationEvent(
  params: CreateInvalidationEventParams,
): Promise<CreateInvalidationEventResult> {
  const {
    dteDocumentId,
    invalidationTypeCode,
    reason,
    replacementGenerationCode,
    responsable,
    solicita,
    userId,
    tenantId,
    locationId,
  } = params;

  try {
    // ── 1. Cargar DteOutgoingDocument con scope tenant/location ────
    const dteDoc = await prisma.dteOutgoingDocument.findFirst({
      where: { id: dteDocumentId, tenant_id: tenantId, location_id: locationId },
      select: {
        id:               true,
        tenant_id:        true,
        location_id:      true,
        dte_type_code:    true,
        dte_status:       true,
        generation_code:  true,
        control_number:   true,
        reception_stamp:  true,
        json_document:    true,
        issuer_config_id: true,
      },
    });

    if (!dteDoc) {
      throw new InvalidationBusinessError(
        "El documento DTE no existe o no pertenece a la location activa.",
      );
    }

    // ── 2. Validar estado ACCEPTED ─────────────────────────────────
    if (dteDoc.dte_status !== "ACCEPTED") {
      throw new InvalidationBusinessError(
        `El documento DTE debe estar en estado ACCEPTED para invalidar. Estado actual: "${dteDoc.dte_status}".`,
      );
    }

    // ── 3. Validar tipo DTE permitido ─────────────────────────────
    if (!INVALIDABLE_DTE_TYPES.has(dteDoc.dte_type_code)) {
      throw new InvalidationBusinessError(
        `El tipo de DTE "${dteDoc.dte_type_code}" no está habilitado para invalidación.`,
      );
    }

    // ── 4. Validar campos obligatorios del documento ───────────────
    if (!dteDoc.generation_code) {
      throw new InvalidationBusinessError("El documento DTE no tiene codigoGeneracion.");
    }
    if (!dteDoc.control_number) {
      throw new InvalidationBusinessError("El documento DTE no tiene numeroControl.");
    }
    if (!dteDoc.reception_stamp || dteDoc.reception_stamp.length !== 40) {
      throw new InvalidationBusinessError(
        "El sello de recepción (reception_stamp) debe tener exactamente 40 caracteres.",
      );
    }
    if (!dteDoc.json_document) {
      throw new InvalidationBusinessError("El documento DTE no tiene json_document.");
    }
    if (!dteDoc.issuer_config_id) {
      throw new InvalidationBusinessError("El documento DTE no tiene issuer_config_id.");
    }

    // ── 5. Bloquear si ya existe evento activo para este DTE ───────
    const existingActive = await prisma.dteInvalidationEvent.findFirst({
      where: {
        dte_document_id: dteDocumentId,
        status:          { in: Array.from(ACTIVE_INVALIDATION_STATUSES) as DteInvalidationStatus[] },
      },
      select: { id: true, status: true },
    });

    if (existingActive) {
      throw new InvalidationBusinessError(
        `Ya existe un evento de invalidación activo (${existingActive.status}) para este documento DTE. No se puede crear uno nuevo hasta que el anterior sea cancelado o rechazado.`,
      );
    }

    // ── 6. Cargar DteIssuerConfig ─────────────────────────────────
    const issuerConfig = await prisma.dteIssuerConfig.findFirst({
      where: { id: dteDoc.issuer_config_id },
      select: {
        id:                     true,
        nit:                    true,
        name:                   true,
        legal_name:             true,
        establishment_type_code: true,
        establishment_code:     true,
        cod_estable_mh:         true,
        point_of_sale_code:     true,
        cod_punto_venta_mh:     true,
        phone:                  true,
        email:                  true,
        environment:            true,
      },
    });

    if (!issuerConfig) {
      throw new InvalidationBusinessError(
        "No se encontró la configuración del emisor DTE asociada al documento.",
      );
    }

    // ── 7. Validar campos del emisor ──────────────────────────────
    if (!issuerConfig.nit) {
      throw new InvalidationBusinessError("El emisor DTE no tiene NIT configurado.");
    }
    if (!issuerConfig.name) {
      throw new InvalidationBusinessError("El emisor DTE no tiene nombre configurado.");
    }
    if (!issuerConfig.establishment_type_code) {
      throw new InvalidationBusinessError(
        "El emisor DTE no tiene tipoEstablecimiento configurado.",
      );
    }
    if (!issuerConfig.email) {
      throw new InvalidationBusinessError(
        "El emisor DTE no tiene correo electrónico configurado.",
      );
    }

    // ── 8. Generar eventGenerationCode ────────────────────────────
    const eventGenerationCode = randomUUID().toUpperCase();

    // ── 9. Parsear json_document original ─────────────────────────
    const originalJsonDocument = dteDoc.json_document as unknown as OriginalDteJsonDocument;

    // ── 10. Construir y validar el JSON del evento ─────────────────
    const now = new Date();

    const buildResult = buildInvalidationEventJson({
      issuerConfig: {
        nit:                     issuerConfig.nit,
        name:                    issuerConfig.name,
        legal_name:              issuerConfig.legal_name,
        establishment_type_code: issuerConfig.establishment_type_code,
        establishment_code:      issuerConfig.establishment_code,
        cod_estable_mh:          issuerConfig.cod_estable_mh,
        point_of_sale_code:      issuerConfig.point_of_sale_code,
        cod_punto_venta_mh:      issuerConfig.cod_punto_venta_mh,
        phone:                   issuerConfig.phone,
        email:                   issuerConfig.email,
        environment:             issuerConfig.environment,
      },
      dteDocument: {
        dte_type_code:   dteDoc.dte_type_code,
        generation_code: dteDoc.generation_code,
        reception_stamp: dteDoc.reception_stamp,
        control_number:  dteDoc.control_number,
        dte_status:      dteDoc.dte_status,
      },
      originalJsonDocument,
      eventGenerationCode,
      invalidationTypeCode,
      reason:                    reason ?? null,
      replacementGenerationCode: replacementGenerationCode ?? null,
      responsable,
      solicita,
      now,
    });

    if (!buildResult.ok) {
      return { ok: false, message: buildResult.error };
    }

    // ── 11. Persistir DteInvalidationEvent en DRAFT ───────────────
    const invalidationEvent = await prisma.dteInvalidationEvent.create({
      data: {
        tenant_id:              tenantId,
        location_id:            locationId,
        dte_document_id:        dteDocumentId,
        invalidation_type_code: invalidationTypeCode,
        reason:                 reason ?? "",
        event_json:             buildResult.eventJson as Prisma.InputJsonValue,
        status:                 "DRAFT",
        requested_by:           userId,
        requested_at:           now,
      },
      select: { id: true },
    });

    // ── 12. DteOutgoingDocument NO se modifica — sigue ACCEPTED ────

    return {
      ok:                  true,
      invalidationEventId: invalidationEvent.id,
      dteDocumentId,
      status:              "DRAFT",
      eventGenerationCode,
    };

  } catch (err) {
    if (err instanceof InvalidationBusinessError) {
      return { ok: false, message: err.message };
    }
    console.error("[createInvalidationEvent] Error inesperado:", err);
    return {
      ok:      false,
      message: "Error interno al crear el evento de invalidación.",
    };
  }
}
