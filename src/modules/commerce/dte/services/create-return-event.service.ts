// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-return-event.service.ts
//
// MH20 (Fase 6, IMP20-022) — crea un DteReturnEvent (tipo 18) en DRAFT con
// su event_json validado (fe-eret-v1 + reglas R20-RET-*).
//
// Reglas críticas:
//   - Solo perfil MH_2_0 (interruptor DTE_MH20_PROFILE_ENABLED + emisor).
//     PRODUCTION falla cerrado (INC-013, registro). Sin interruptor: el
//     Retorno no existe (no se consulta ninguna tabla M2).
//   - Solo DTE 01/11/14 ACCEPTED|OBSERVED con sello y no invalidados, de la
//     MISMA location, emisor y ambiente (aislamiento tenant/emisor/ambiente).
//   - Lock de fila (SELECT … FOR UPDATE) sobre los DTE originales dentro de
//     la transacción: dos retornos concurrentes no superan el saldo.
//   - Saldo por línea y campo (utils/dte-return-balance.ts). Nunca se
//     supera la línea original ni el total del DTE (MH20-059).
//   - NO modifica DteOutgoingDocument (el Retorno no invalida, MH20-059).
//   - NO aplica movimientos de inventario, caja, ventas ni compras
//     (Fase 7, IMP20-030). NO firma. NO transmite.
// ─────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolveIssuerSpecProfileForGeneration } from "../spec/resolve-issuer-spec-profile";
import { buildReturnEventJson } from "./build-return-event-json.service";
import { loadReturnedAmountsByLine } from "./dte-return-event.guards";
import {
  RETURN_MAX_DOCUMENTS,
  RETURN_MAX_ITEMS,
  isReturnEligibleDteType,
  type ReturnLineAmounts,
  type ReturnLineInput,
} from "../types/dte-return-event-json.types";
import {
  proposeProportionalReturnAmounts,
  readReturnOriginLine,
  remainingReturnAmounts,
  returnExcessFields,
  returnedBaseAmount,
  zeroReturnAmounts,
} from "../utils/dte-return-balance";

export interface CreateReturnEventLine {
  dteDocumentId: string;
  sourceItemNo:  number;
  quantity:      number;
  /** Importes explícitos; si se omiten, propuesta proporcional (PROVISIONAL). */
  amounts?:      Omit<ReturnLineAmounts, "quantity">;
}

export interface CreateReturnEventParams {
  tenantId:   string;
  locationId: string;
  userId:     string | null;
  lines:      CreateReturnEventLine[];
  reason?:    string | null;
  now?:       Date;
}

export type CreateReturnEventResult =
  | { ok: true; returnEventId: string; generationCode: string; status: "DRAFT"; totalReturned: number; warnings: string[] }
  | { ok: false; error: string; code?: string };

class ReturnBusinessError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "ReturnBusinessError";
  }
}

const RETURNABLE_STATUSES = new Set(["ACCEPTED", "OBSERVED"]);
function addMonths(d: Date, m: number): Date {
  const r = new Date(d.getTime());
  r.setUTCMonth(r.getUTCMonth() + m);
  return r;
}

export async function createReturnEvent(
  params: CreateReturnEventParams,
  db: PrismaClient = prisma,
): Promise<CreateReturnEventResult> {
  const { tenantId, locationId, userId, lines, reason = null } = params;
  const now = params.now ?? new Date();

  try {
    if (lines.length < 1 || lines.length > RETURN_MAX_ITEMS) {
      throw new ReturnBusinessError(`El Retorno debe tener entre 1 y ${RETURN_MAX_ITEMS} líneas.`, "R20-RET-03");
    }
    const docIds = [...new Set(lines.map((l) => l.dteDocumentId))].sort();
    if (docIds.length > RETURN_MAX_DOCUMENTS) {
      throw new ReturnBusinessError(`El Retorno admite como máximo ${RETURN_MAX_DOCUMENTS} documentos.`, "R20-RET-02");
    }

    const result = await db.$transaction(async (tx) => {
      // 1. Lock de fila de los DTE originales (scope tenant + location).
      await tx.$queryRaw`
        SELECT id FROM dte_outgoing_documents
        WHERE tenant_id = ${tenantId} AND location_id = ${locationId} AND id IN (${Prisma.join(docIds)})
        ORDER BY id
        FOR UPDATE`;

      const docs = await tx.dteOutgoingDocument.findMany({
        where:  { id: { in: docIds }, tenant_id: tenantId, location_id: locationId },
        select: {
          id: true, dte_type_code: true, dte_status: true, generation_code: true, reception_stamp: true,
          json_document: true, issuer_config_id: true, environment: true, accepted_at: true, invalidated_at: true,
        },
      });
      if (docs.length !== docIds.length) {
        throw new ReturnBusinessError("Uno o más documentos no existen o no pertenecen a la location activa.");
      }
      const issuerIds = new Set(docs.map((d) => d.issuer_config_id));
      const envs      = new Set(docs.map((d) => d.environment));
      const types     = new Set(docs.map((d) => d.dte_type_code));
      if (issuerIds.size !== 1 || envs.size !== 1 || !docs[0].issuer_config_id) {
        throw new ReturnBusinessError("Todos los documentos del Retorno deben pertenecer al mismo emisor y ambiente.", "R20-RET-04");
      }
      if (types.size !== 1) throw new ReturnBusinessError("Todos los documentos del Retorno deben ser del mismo tipo.", "R20-RET-02");
      const originType   = docs[0].dte_type_code;
      const issuerId     = docs[0].issuer_config_id;
      const environment  = docs[0].environment;
      if (!isReturnEligibleDteType(originType)) {
        throw new ReturnBusinessError(`El Evento de Retorno solo aplica a FE, FEXE y FSEE (tipo "${originType}").`, "R20-RET-01");
      }
      for (const d of docs) {
        if (!RETURNABLE_STATUSES.has(d.dte_status) || d.invalidated_at !== null || !d.reception_stamp || !d.generation_code) {
          throw new ReturnBusinessError(
            `El DTE ${d.generation_code} no tiene sello vigente (estado ${d.dte_status}); no se le puede aplicar Retorno.`,
            "R20-RET-01",
          );
        }
      }

      // 2. Perfil normativo: solo MH_2_0. PRODUCTION fail-closed (INC-013).
      const profile = await resolveIssuerSpecProfileForGeneration(
        tx as unknown as PrismaClient, issuerId, tenantId, locationId, environment, "18",
      );
      if (!profile.ok) throw new ReturnBusinessError(profile.error);
      if (profile.profile !== "MH_2_0") {
        throw new ReturnBusinessError(
          "El Evento de Retorno solo existe en la normativa MH 2.0: el emisor no tiene el perfil MH_2_0 activo.",
          "PROFILE",
        );
      }
      const warnings: string[] = profile.warning ? [profile.warning] : [];

      // 3. Plazo (INC-013/INC-009): 3 meses; origen sello (N2.0) vs
      //    generación (MF). Solo advertencia PROVISIONAL en TEST, desde el
      //    más restrictivo (el anterior de ambos).
      for (const d of docs) {
        const fec = (d.json_document as { identificacion?: { fecEmi?: string } } | null)?.identificacion?.fecEmi;
        const starts = [fec ? new Date(`${fec}T00:00:00Z`) : null, d.accepted_at].filter((x): x is Date => x instanceof Date);
        if (starts.length === 0) continue;
        const start = new Date(Math.min(...starts.map((x) => x.getTime())));
        if (now.getTime() > addMonths(start, 3).getTime()) {
          warnings.push(`PROVISIONAL (INC-013): el DTE ${d.generation_code} supera 3 meses desde su generación/sello.`);
        }
      }

      // 4. Emisor (misma location y ambiente).
      const issuer = await tx.dteIssuerConfig.findFirst({
        where:  { id: issuerId, tenant_id: tenantId, location_id: locationId, environment },
        select: {
          nit: true, name: true, establishment_code: true, cod_estable_mh: true,
          point_of_sale_code: true, cod_punto_venta_mh: true, environment: true,
        },
      });
      if (!issuer || !issuer.nit || !issuer.name) {
        throw new ReturnBusinessError("La configuración del emisor DTE no existe, no pertenece a la location o está incompleta.");
      }

      // 5. Saldo elegible por línea (acumulado vigente, ya bajo lock).
      const returned = await loadReturnedAmountsByLine(tx, { tenantId, dteDocumentIds: docIds });
      const byId = new Map(docs.map((d) => [d.id, d]));
      const builtLines: ReturnLineInput[] = [];
      for (const l of lines) {
        const d = byId.get(l.dteDocumentId)!;
        const orig = readReturnOriginLine(d.json_document, l.sourceItemNo);
        if (!orig) throw new ReturnBusinessError(`El DTE ${d.generation_code} no tiene la línea ${l.sourceItemNo}.`, "R20-RET-08");
        const already   = returned.get(`${l.dteDocumentId}#${l.sourceItemNo}`) ?? zeroReturnAmounts();
        const remaining = remainingReturnAmounts(orig, already);
        if (!(l.quantity > 0)) throw new ReturnBusinessError("La cantidad devuelta debe ser mayor que 0.", "R20-RET-08");
        const amounts: ReturnLineAmounts = l.amounts
          ? { quantity: l.quantity, ...l.amounts }
          : proposeProportionalReturnAmounts(orig, already, l.quantity);
        const excess = returnExcessFields(amounts, remaining);
        if (excess.length > 0) {
          throw new ReturnBusinessError(
            `La línea ${l.sourceItemNo} del DTE ${d.generation_code} excede el saldo elegible de retorno: ${excess.join("; ")}.`,
            "R20-RET-08",
          );
        }
        if (returnedBaseAmount(amounts) + amounts.ivaItem + amounts.noGravado <= 0) {
          throw new ReturnBusinessError(`La línea ${l.sourceItemNo} no devuelve ningún importe.`, "R20-RET-08");
        }
        builtLines.push({ dteDocumentId: l.dteDocumentId, sourceItemNo: l.sourceItemNo, amounts });
      }

      // 6. JSON del evento (AJV fe-eret-v1 + reglas).
      const generationCode = randomUUID().toUpperCase();
      const built = buildReturnEventJson({
        issuerConfig:        issuer,
        originType,
        documents:           docIds.map((id) => {
          const d = byId.get(id)!;
          return {
            dteDocumentId: d.id, dteTypeCode: d.dte_type_code, generationCode: d.generation_code ?? "",
            receptionStamp: d.reception_stamp, jsonDocument: d.json_document,
          };
        }),
        lines:               builtLines,
        eventGenerationCode: generationCode,
        now,
      });
      if (!built.ok) throw new ReturnBusinessError(built.error, built.code);
      warnings.push(...built.warnings);

      // 7. Persistencia (DRAFT). El DTE original no se toca.
      const cuerpo = built.eventJson.cuerpoDocumento as Array<Record<string, unknown>>;
      const event = await tx.dteReturnEvent.create({
        data: {
          tenant_id:              tenantId,
          location_id:            locationId,
          issuer_config_id:       issuerId,
          environment,
          generation_code:        generationCode,
          origin_dte_type_code:   originType,
          reason,
          event_json:             built.eventJson as Prisma.InputJsonValue,
          status:                 "DRAFT",
          transmission_type_code: "1",
          mh_spec_profile:        "MH_2_0",
          total_returned:         new Prisma.Decimal(built.totalReturned),
          requested_at:           now,
          requested_by:           userId,
          created_by:             userId,
          updated_by:             userId,
          items: {
            create: builtLines.map((l, i) => ({
              dte_document_id: l.dteDocumentId,
              no_item:         i + 1,
              source_item_no:  l.sourceItemNo,
              quantity:        new Prisma.Decimal(l.amounts.quantity),
              returned_amount: new Prisma.Decimal(returnedBaseAmount(l.amounts)),
              returned_tax:    new Prisma.Decimal(l.amounts.ivaItem),
              line_detail:     cuerpo[i] as Prisma.InputJsonValue,
            })),
          },
        },
        select: { id: true },
      });
      return { id: event.id, generationCode, totalReturned: built.totalReturned, warnings };
    });

    return {
      ok: true, returnEventId: result.id, generationCode: result.generationCode,
      status: "DRAFT", totalReturned: result.totalReturned, warnings: result.warnings,
    };
  } catch (err) {
    if (err instanceof ReturnBusinessError) return { ok: false, error: err.message, code: err.code };
    console.error("[createReturnEvent] Error inesperado:", err instanceof Error ? err.name : "error");
    return { ok: false, error: "Error interno al crear el Evento de Retorno." };
  }
}
