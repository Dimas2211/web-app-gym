// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-return-invalidation-event.service.ts
//
// MH20 (Fase 6, IMP20-024) — Invalidación de un Evento de Retorno
// (MH20-046/049): Invalidación v3 con documento.tipoDte = "18",
// numeroControl = null y tipoAnulacion 2 (MF 2.0: "referenciando únicamente
// el código de generación del Evento de Retorno … y en código de reemplazo
// la palabra null").
//
// Reglas:
//   - Solo perfil MH_2_0; PRODUCTION fail-closed (INC-004/006, registro y
//     tabla de plazos UNSET).
//   - El Retorno debe estar ACCEPTED con sello de 40 caracteres (Cuadro 6
//     fila 4). Mientras MT-GAP-001 siga abierto ningún Retorno llega a
//     ACCEPTED: el flujo queda listo, verificable con datos de prueba.
//   - Una sola invalidación vigente por Retorno.
//   - Persiste en dte_return_invalidation_events (M2). NO toca
//     dte_invalidation_events ni el estado de ningún DTE.
//   - Firma/transmisión de esta invalidación: pendiente (depende de un
//     Retorno aceptado; ver 06-pending-activation-blockers.md).
// ─────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type { DteEnvironment, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolveIssuerSpecProfileForGeneration } from "../spec/resolve-issuer-spec-profile";
import { evaluateInvalidationDeadline } from "../spec/dte-invalidation-deadlines";
import { buildInvalidationEventJsonV3 } from "./build-invalidation-event-json.v3";
import type { InvalidationPersona, OriginalDteReceptor } from "../types/dte-invalidation-event-json.types";

export interface CreateReturnInvalidationParams {
  returnEventId: string;
  reason:        string;
  responsable:   InvalidationPersona;
  solicita:      InvalidationPersona;
  userId:        string | null;
  tenantId:      string;
  locationId:    string;
  now?:          Date;
}

export type CreateReturnInvalidationResult =
  | { ok: true; returnInvalidationEventId: string; eventGenerationCode: string; status: "DRAFT"; warnings: string[] }
  | { ok: false; error: string };

const ACTIVE = ["DRAFT", "PENDING_SIGNATURE", "SIGNED", "SENT", "ACCEPTED"] as const;
class ReturnInvalidationError extends Error {}

export async function createReturnInvalidationEvent(
  params: CreateReturnInvalidationParams,
  db: PrismaClient = prisma,
): Promise<CreateReturnInvalidationResult> {
  const { returnEventId, reason, responsable, solicita, userId, tenantId, locationId } = params;
  const now = params.now ?? new Date();
  try {
    const ret = await db.dteReturnEvent.findFirst({
      where:  { id: returnEventId, tenant_id: tenantId, location_id: locationId },
      select: {
        id: true, status: true, generation_code: true, mh_sello_recibido: true, event_json: true,
        issuer_config_id: true, environment: true, accepted_at: true,
      },
    });
    if (!ret) throw new ReturnInvalidationError("El Evento de Retorno no existe o no pertenece a la location activa.");
    if (ret.status !== "ACCEPTED" || !ret.mh_sello_recibido) {
      throw new ReturnInvalidationError(`Solo se invalida un Evento de Retorno con sello de recepción (estado actual: "${ret.status}").`);
    }
    const active = await db.dteReturnInvalidationEvent.findFirst({
      where:  { return_event_id: returnEventId, tenant_id: tenantId, status: { in: [...ACTIVE] } },
      select: { id: true, status: true },
    });
    if (active) throw new ReturnInvalidationError(`Ya existe una invalidación activa (${active.status}) para este Evento de Retorno.`);

    const profile = await resolveIssuerSpecProfileForGeneration(db, ret.issuer_config_id, tenantId, locationId, ret.environment, "INV");
    if (!profile.ok) throw new ReturnInvalidationError(profile.error);
    if (profile.profile !== "MH_2_0") throw new ReturnInvalidationError("La invalidación de un Retorno solo existe con el perfil MH_2_0.");
    const warnings = profile.warning ? [profile.warning] : [];

    const ej = (ret.event_json ?? {}) as { identificacion?: { fecEmi?: string }; documento?: OriginalDteReceptor | null };
    const deadline = evaluateInvalidationDeadline({
      profile: "MH_2_0", environment: ret.environment, targetType: "18",
      stampedAt: ret.accepted_at, targetFecEmi: ej.identificacion?.fecEmi ?? null, now,
    });
    if (!deadline.ok) throw new ReturnInvalidationError(deadline.error);
    warnings.push(...deadline.warnings);

    const issuer = await db.dteIssuerConfig.findFirst({
      where:  { id: ret.issuer_config_id, tenant_id: tenantId, location_id: locationId, environment: ret.environment as DteEnvironment },
      select: {
        nit: true, name: true, legal_name: true, establishment_type_code: true, establishment_code: true,
        cod_estable_mh: true, point_of_sale_code: true, cod_punto_venta_mh: true, phone: true, email: true, environment: true,
      },
    });
    if (!issuer) throw new ReturnInvalidationError("La configuración del emisor del Retorno no existe o no pertenece a la location.");

    const eventGenerationCode = randomUUID().toUpperCase();
    const built = buildInvalidationEventJsonV3({
      issuerConfig: { ...issuer, nit: issuer.nit ?? "", name: issuer.name ?? "" },
      target: {
        tipoDte:        "18",
        generationCode: ret.generation_code,
        receptionStamp: ret.mh_sello_recibido,
        controlNumber:  null,
        fecEmi:         ej.identificacion?.fecEmi ?? "",
        receptor:       ej.documento ?? null,
      },
      eventGenerationCode,
      invalidationTypeCode: "2",
      reason,
      replacementGenerationCode: null,
      responsable,
      solicita,
      now,
    });
    if (!built.ok) throw new ReturnInvalidationError(built.error);

    const row = await db.dteReturnInvalidationEvent.create({
      data: {
        tenant_id: tenantId, location_id: locationId, return_event_id: returnEventId,
        invalidation_type_code: "2", reason,
        event_json: built.eventJson as Prisma.InputJsonValue,
        status: "DRAFT", mh_spec_profile: "MH_2_0", requested_at: now, requested_by: userId,
      },
      select: { id: true },
    });
    return { ok: true, returnInvalidationEventId: row.id, eventGenerationCode, status: "DRAFT", warnings };
  } catch (err) {
    if (err instanceof ReturnInvalidationError) return { ok: false, error: err.message };
    console.error("[createReturnInvalidationEvent] Error inesperado:", err instanceof Error ? err.name : "error");
    return { ok: false, error: "Error interno al crear la invalidación del Evento de Retorno." };
  }
}
