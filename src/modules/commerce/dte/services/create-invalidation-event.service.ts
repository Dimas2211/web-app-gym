// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-invalidation-event.service.ts
//
// createInvalidationEvent — crea un DteInvalidationEvent en estado DRAFT.
//
// Reglas críticas:
//   - Solo opera sobre DteOutgoingDocument en estado ACCEPTED.
//   - Tipos DTE permitidos para invalidar: "01" (FE), "03" (CCFE), "05" (NC), "11" (FEX).
//   - Bloquea si ya existe un evento activo (DRAFT|PENDING_SIGNATURE|SIGNED|SENT|ACCEPTED).
//   - Genera eventGenerationCode con crypto.randomUUID().toUpperCase().
//   - Delega construcción/validación del JSON al builder (buildInvalidationEventJson).
//   - NO modifica DteOutgoingDocument — sigue ACCEPTED.
//   - NO firma. NO transmite. NO toca Prisma schema.
//
// FASE VI-E6B — acepta un `db` explícito (PrismaClient runtime) que se
// usa para TODA lectura/escritura tenant-owned (DteOutgoingDocument,
// DteIssuerConfig, DteInvalidationEvent existente/nuevo). Sin `db`, cae
// al Prisma global (comportamiento legacy para callers PLATFORM_NATIVE
// no migrados). Certifica que para RUNTIME_CLIENT el DTE original + el
// emisor + el nuevo evento de invalidación salen/entran de la MISMA
// base runtime — nunca solo mismo tenant_id (mismo patrón que
// sign-dte-document.service.ts, VI-E5A).
// ─────────────────────────────────────────────────────────────────

import { randomUUID }                   from "crypto";
import type { PrismaClient }            from "@prisma/client";
import { type DteInvalidationStatus, Prisma } from "@prisma/client";
import { prisma }                       from "@/lib/db/prisma";
import { buildInvalidationEventJson }   from "./build-invalidation-event-json.service";
import type { InvalidationPersona }     from "../types/dte-invalidation-event-json.types";
import type { OriginalDteJsonDocument } from "../types/dte-invalidation-event-json.types";
import { mh20ProfileWriteDataWithOverride } from "../config/dte-mh20.flags";
import type { MhTestRunSpecProfileOverride } from "../spec/mh-test-run-profile-override";
import { resolveIssuerSpecProfileForGeneration } from "../spec/resolve-issuer-spec-profile";
import { evaluateInvalidationDeadline, isInvalidableDteType } from "../spec/dte-invalidation-deadlines";
import { checkDteDocumentSpecCoherence } from "../spec/dte-spec-guard";
import { findActiveReturnsForDocument } from "./dte-return-event.guards";

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
  /** MH20 (Fase 9.0): perfil de una corrida MH TEST (solo TEST). */
  specProfileOverride?:      MhTestRunSpecProfileOverride | null;
}

export type CreateInvalidationEventResult =
  | {
      ok:                   true;
      invalidationEventId:  string;
      dteDocumentId:        string;
      status:               "DRAFT";
      eventGenerationCode:  string;
      /** MH20 (Fase 6): advertencias PROVISIONALES (solo perfil MH_2_0 en TEST). */
      warnings?:            string[];
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

const INVALIDABLE_DTE_TYPES = new Set(["01", "03", "05", "11"]);
/** MH20 (Fase 6.1): tipos invalidables SOLO con el perfil MH_2_0 (FSEE 14). */
const MH20_ONLY_INVALIDABLE_DTE_TYPES = new Set(["14"]);

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
  db: PrismaClient = prisma,
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
    const dteDoc = await db.dteOutgoingDocument.findFirst({
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
        environment:      true,
        accepted_at:      true,
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
    if (!INVALIDABLE_DTE_TYPES.has(dteDoc.dte_type_code) && !MH20_ONLY_INVALIDABLE_DTE_TYPES.has(dteDoc.dte_type_code)) {
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
    const existingActive = await db.dteInvalidationEvent.findFirst({
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

    // ── 6. Cargar DteIssuerConfig — misma runtime DB, mismo tenant/
    //      location que el documento (VI-E6B / F, H). Mismo patrón
    //      estructural que sign-dte-document.service.ts (VI-E5A).
    const issuerConfig = await db.dteIssuerConfig.findFirst({
      where: { id: dteDoc.issuer_config_id, tenant_id: tenantId, location_id: locationId },
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

    // ── 6b. Consistencia de ambiente documento <-> emisor (VI-E6B / I).
    //       El ambiente fiscal de autoridad para la invalidación es
    //       siempre dteDoc.environment. Nunca se permite mezclar
    //       TEST/PRODUCTION entre documento y emisor.
    if (issuerConfig.environment !== dteDoc.environment) {
      throw new InvalidationBusinessError(
        "El ambiente del emisor no coincide con el ambiente del documento DTE. Invalidación bloqueada.",
      );
    }

    // ── 6c. MH20 (Fase 6) — perfil normativo del evento. Interruptor
    //       OFF → MH_1_2 sin consultar columnas M1 (comportamiento
    //       histórico). MH_2_0 → v3: PRODUCTION fail-closed (INC-004/006).
    const profileResult = await resolveIssuerSpecProfileForGeneration(
      db, dteDoc.issuer_config_id, tenantId, locationId, dteDoc.environment, "INV", params.specProfileOverride,
    );
    if (!profileResult.ok) throw new InvalidationBusinessError(profileResult.error);
    const profile  = profileResult.profile;
    const warnings: string[] = profileResult.warning ? [profileResult.warning] : [];

    // Fase 6.1: FSE 14 solo es invalidable con MH_2_0 (mismo mensaje histórico con 1.2).
    if (profile === "MH_1_2" && !INVALIDABLE_DTE_TYPES.has(dteDoc.dte_type_code)) {
      throw new InvalidationBusinessError(
        `El tipo de DTE "${dteDoc.dte_type_code}" no está habilitado para invalidación.`,
      );
    }

    if (profile === "MH_2_0") {
      if (!isInvalidableDteType(profile, dteDoc.dte_type_code)) {
        throw new InvalidationBusinessError(
          `El tipo de DTE "${dteDoc.dte_type_code}" no está habilitado para invalidación con el perfil MH 2.0.`,
        );
      }
      const deadline = evaluateInvalidationDeadline({
        profile,
        environment:  dteDoc.environment,
        targetType:   dteDoc.dte_type_code,
        stampedAt:    dteDoc.accepted_at,
        targetFecEmi: (dteDoc.json_document as { identificacion?: { fecEmi?: string } } | null)?.identificacion?.fecEmi ?? null,
        now:          new Date(),
      });
      if (!deadline.ok) throw new InvalidationBusinessError(deadline.error);
      warnings.push(...deadline.warnings);

      // MH20-094 (abierto): evento 2.0 sobre un DTE emitido con 1.2.
      const docSpec = checkDteDocumentSpecCoherence({ kind: dteDoc.dte_type_code, jsonDocument: dteDoc.json_document });
      if (docSpec.ok && docSpec.profile === "MH_1_2") {
        warnings.push("PROVISIONAL (MH20-094): invalidación v3 sobre un DTE emitido con MH 1.2; criterio de coexistencia sin confirmar.");
      }

      // MH20-049: una FE/FEXE/FSEE con Retorno aplicado debe invalidar
      // primero el Retorno. Requiere M2 (prerrequisito del perfil MH_2_0).
      const activeReturns = await findActiveReturnsForDocument(db, { tenantId, dteDocumentId });
      if (activeReturns.length > 0) {
        throw new InvalidationBusinessError(
          `El documento tiene ${activeReturns.length} Evento(s) de Retorno vigente(s). ` +
          "Invalide primero el Retorno (MH20-049) antes de invalidar el documento.",
        );
      }
    }

    // ── 7. Validar campos del emisor ──────────────────────────────
    if (!issuerConfig.nit) {
      throw new InvalidationBusinessError("El emisor DTE no tiene NIT configurado.");
    }
    if (!issuerConfig.name) {
      throw new InvalidationBusinessError("El emisor DTE no tiene nombre configurado.");
    }
    // tipoEstablecimiento solo existe en la Invalidación v2 (MH_1_2).
    if (profile === "MH_1_2" && !issuerConfig.establishment_type_code) {
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
      profile,
    });

    if (!buildResult.ok) {
      return { ok: false, message: buildResult.error };
    }

    // ── 11. Persistir DteInvalidationEvent en DRAFT ───────────────
    const invalidationEvent = await db.dteInvalidationEvent.create({
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
        ...mh20ProfileWriteDataWithOverride(profile, params.specProfileOverride),
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
      ...(warnings.length > 0 ? { warnings } : {}),
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
