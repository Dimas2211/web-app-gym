// ─────────────────────────────────────────────────────────────────
// commerce/dte — persist-contingency-event-json.service.ts
//
// buildAndPersistContingencyEventJson — carga un DteContingencyEvent en
// DRAFT junto con sus items/DTE/issuer config, delega la construcción y
// validación AJV a buildContingencyEventJson, y si el resultado es válido
// persiste event_json y avanza DRAFT → PENDING_SIGNATURE.
//
// Reglas:
//   - Solo opera sobre DteContingencyEvent.status === "DRAFT".
//   - Si AJV falla, el evento se mantiene en DRAFT (no se persiste nada).
//   - NO firma. NO transmite.
// ─────────────────────────────────────────────────────────────────

import { type Prisma } from "@prisma/client";
import { prisma }                     from "@/lib/db/prisma";
import { buildContingencyEventJson }  from "./build-contingency-event-json.service";
import type { ContingencyResponsable } from "../types/dte-contingency-event-json.types";

// ── Tipos públicos ────────────────────────────────────────────────

export interface BuildAndPersistContingencyEventJsonParams {
  contingencyEventId: string;
  tenantId:           string;
  locationId:         string;
  responsable:        ContingencyResponsable;
}

export type BuildAndPersistContingencyEventJsonResult =
  | { ok: true;  status: "PENDING_SIGNATURE"; eventJson: Record<string, unknown> }
  | { ok: false; error: string };

// ── Error de negocio interno ────────────────────────────────────────

class PersistContingencyJsonBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistContingencyJsonBusinessError";
  }
}

// ── Función principal ─────────────────────────────────────────────

export async function buildAndPersistContingencyEventJson(
  params: BuildAndPersistContingencyEventJsonParams,
): Promise<BuildAndPersistContingencyEventJsonResult> {
  const { contingencyEventId, tenantId, locationId, responsable } = params;

  try {
    // ── 1. Cargar evento con scope tenant/location ──────────────────
    const event = await prisma.dteContingencyEvent.findFirst({
      where: { id: contingencyEventId, tenant_id: tenantId, location_id: locationId },
      select: {
        id:                     true,
        status:                 true,
        generation_code:        true,
        contingency_type_code:  true,
        reason:                 true,
        period_start_date:      true,
        period_start_time:      true,
        period_end_date:        true,
        period_end_time:        true,
        items: {
          orderBy: { no_item: "asc" },
          select: {
            no_item: true,
            dte_document: {
              select: {
                id:               true,
                dte_type_code:    true,
                generation_code:  true,
                issuer_config_id: true,
              },
            },
          },
        },
      },
    });

    if (!event) {
      throw new PersistContingencyJsonBusinessError(
        "El Evento de Contingencia no existe o no pertenece a la location activa.",
      );
    }
    if (event.status !== "DRAFT") {
      throw new PersistContingencyJsonBusinessError(
        `Solo se puede construir el JSON de eventos en estado DRAFT. Estado actual: "${event.status}".`,
      );
    }
    if (event.items.length === 0) {
      throw new PersistContingencyJsonBusinessError(
        "El Evento de Contingencia no tiene documentos DTE asociados.",
      );
    }
    if (!event.period_start_date || !event.period_start_time || !event.period_end_date || !event.period_end_time) {
      throw new PersistContingencyJsonBusinessError(
        "El Evento de Contingencia no tiene período completo persistido.",
      );
    }

    // ── 2. Resolver issuer config (debe ser el mismo para todos los items) ──
    const issuerConfigIds = new Set(event.items.map((i) => i.dte_document.issuer_config_id));
    if (issuerConfigIds.size !== 1 || !event.items[0]?.dte_document.issuer_config_id) {
      throw new PersistContingencyJsonBusinessError(
        "Los documentos DTE del Evento no comparten un único issuer_config_id — no se puede construir un emisor consistente.",
      );
    }
    const issuerConfigId = event.items[0].dte_document.issuer_config_id!;

    const issuerConfig = await prisma.dteIssuerConfig.findFirst({
      where: { id: issuerConfigId },
      select: {
        nit:                     true,
        name:                    true,
        establishment_type_code: true,
        cod_estable_mh:          true,
        point_of_sale_code:      true,
        cod_punto_venta_mh:      true,
        phone:                   true,
        email:                   true,
        environment:             true,
      },
    });
    if (!issuerConfig) {
      throw new PersistContingencyJsonBusinessError(
        "No se encontró la configuración del emisor DTE asociada a los documentos del Evento.",
      );
    }

    // ── 3. Construir y validar el JSON ────────────────────────────────
    const buildResult = buildContingencyEventJson({
      issuerConfig,
      responsable,
      eventGenerationCode: event.generation_code,
      contingencyTypeCode: event.contingency_type_code as "1" | "2" | "3" | "4" | "5",
      reason:              event.reason,
      periodStartDate:     event.period_start_date,
      periodStartTime:     event.period_start_time,
      periodEndDate:       event.period_end_date,
      periodEndTime:       event.period_end_time,
      items: event.items.map((i) => ({
        no_item:          i.no_item,
        generation_code:  i.dte_document.generation_code!,
        dte_type_code:    i.dte_document.dte_type_code,
      })),
    });

    if (!buildResult.ok) {
      return { ok: false, error: buildResult.error };
    }

    // ── 4. Persistir event_json y avanzar a PENDING_SIGNATURE ─────────
    await prisma.dteContingencyEvent.update({
      where: { id: contingencyEventId },
      data: {
        event_json: buildResult.eventJson as Prisma.InputJsonValue,
        status:     "PENDING_SIGNATURE",
      },
    });

    return { ok: true, status: "PENDING_SIGNATURE", eventJson: buildResult.eventJson };

  } catch (err) {
    if (err instanceof PersistContingencyJsonBusinessError) {
      return { ok: false, error: err.message };
    }
    console.error("[buildAndPersistContingencyEventJson] Error inesperado:", err);
    return { ok: false, error: "Error interno al construir el JSON del Evento de Contingencia." };
  }
}
