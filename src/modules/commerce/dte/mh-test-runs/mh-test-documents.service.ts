// ─────────────────────────────────────────────────────────────────
// commerce/dte/mh-test-runs — mh-test-documents.service.ts
//
// DTE-MH-TEST-RUNS — operaciones sobre la base RUNTIME del cliente para
// los documentos de pruebas de Hacienda. Las invoca el motor del Control
// Plane (nunca una action del runtime del cliente).
//
// Garantías:
//   - Todos los documentos se crean con purpose = MH_TEST_CERTIFICATION,
//     environment = TEST, sin sale_id ni purchase_id (CHECK en BD) y con
//     certification_item_key = "<runId>:<seq>" (UNIQUE en BD).
//   - Reserva de correlativos en BLOQUE coordinada con el asignador
//     existente (reserveDteControlNumberBlock: lock de la fila
//     DteCorrelative + piso max(last_sequence, usados, baseline)).
//   - Materialización idempotente: si los documentos ya existen por
//     certification_item_key se devuelven sin reservar de nuevo; una
//     segunda ejecución concurrente falla por la clave única o por el
//     piso del correlativo y se recupera releyendo por clave.
//   - Cero escrituras en Sale/Purchase/Customer/Supplier/inventario/caja.
// ─────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { reserveDteControlNumberBlock } from "../services/dte-correlative.service";
import { generateNcJsonForDte } from "../services/generate-nc-json.service";
import { DTE_PURPOSE_MH_TEST_CERTIFICATION } from "../utils/dte-document-purpose";
import {
  MH_TEST_ISSUER_SELECT,
  buildMhTestScenarioJson,
  resolveMhTestBuildContext,
  type MhTestContingencySettings,
  type MhTestDteTypeCode,
  type MhTestIssuer,
  type MhTestReceptors,
  type MhTestScenarioCode,
} from "./mh-test-scenarios";

export { mhTestItemKey } from "./mh-test-key";

const CERT_WHERE = { purpose: DTE_PURPOSE_MH_TEST_CERTIFICATION, environment: "TEST" } as const;

export interface MhTestRuntimeScope {
  tenantId:       string;
  locationId:     string;
  issuerConfigId: string;
}

export async function loadMhTestIssuer(db: PrismaClient, scope: MhTestRuntimeScope): Promise<MhTestIssuer | null> {
  return db.dteIssuerConfig.findFirst({
    where:  { id: scope.issuerConfigId, tenant_id: scope.tenantId, location_id: scope.locationId, environment: "TEST" },
    select: MH_TEST_ISSUER_SELECT,
  });
}

// ── Materialización (reserva + creación) ──────────────────────────

export interface MhTestMaterializeItem {
  key:             string;
  dteTypeCode:     MhTestDteTypeCode;
  plannedSequence: number;
  contingency:     boolean;
}

export interface MhTestMaterializedDoc {
  key:            string;
  dteDocumentId:  string;
  controlNumber:  string;
  generationCode: string;
}

export type MhTestMaterializeResult =
  | { ok: true; recovered: boolean; docs: MhTestMaterializedDoc[] }
  | { ok: false; code: "ISSUER_NOT_FOUND" | "INVALID_PLAN" | "FIRST_SEQUENCE_ALREADY_USED" | "PARTIAL_STATE"; error: string; nextAvailable?: Partial<Record<MhTestDteTypeCode, number>> };

class MaterializeAbort extends Error {
  constructor(readonly result: Extract<MhTestMaterializeResult, { ok: false }>) {
    super(result.error);
  }
}

async function readByKeys(db: Pick<PrismaClient, "dteOutgoingDocument"> | Prisma.TransactionClient, scope: MhTestRuntimeScope, keys: string[]) {
  return db.dteOutgoingDocument.findMany({
    where:  { tenant_id: scope.tenantId, location_id: scope.locationId, ...CERT_WHERE, certification_item_key: { in: keys } },
    select: { id: true, certification_item_key: true, control_number: true, generation_code: true },
  });
}

function toMaterialized(rows: Awaited<ReturnType<typeof readByKeys>>): MhTestMaterializedDoc[] {
  return rows.map((r) => ({ key: r.certification_item_key!, dteDocumentId: r.id, controlNumber: r.control_number!, generationCode: r.generation_code! }));
}

export async function materializeMhTestDocuments(
  db: PrismaClient,
  scope: MhTestRuntimeScope & { userId: string | null; contingency: MhTestContingencySettings | null },
  items: MhTestMaterializeItem[],
): Promise<MhTestMaterializeResult> {
  if (items.length === 0) return { ok: true, recovered: false, docs: [] };
  const keys = items.map((i) => i.key);

  // Recuperación idempotente: documentos ya creados por una ejecución anterior.
  const before = await readByKeys(db, scope, keys);
  if (before.length === items.length) return { ok: true, recovered: true, docs: toMaterialized(before) };
  if (before.length > 0) {
    return { ok: false, code: "PARTIAL_STATE", error: `Estado parcial: ${before.length}/${items.length} documentos de la corrida existen. Requiere revisión.` };
  }

  const issuer = await loadMhTestIssuer(db, scope);
  if (!issuer || !issuer.cod_estable_mh || !issuer.cod_punto_venta_mh) {
    return { ok: false, code: "ISSUER_NOT_FOUND", error: "Emisor TEST no encontrado o sin cod_estable_mh / cod_punto_venta_mh." };
  }

  // Bloques contiguos por tipo.
  const byType = new Map<MhTestDteTypeCode, MhTestMaterializeItem[]>();
  for (const it of items) byType.set(it.dteTypeCode, [...(byType.get(it.dteTypeCode) ?? []), it]);
  for (const [type, list] of byType) {
    list.sort((a, b) => a.plannedSequence - b.plannedSequence);
    for (let i = 1; i < list.length; i++) {
      if (list[i].plannedSequence !== list[0].plannedSequence + i) {
        return { ok: false, code: "INVALID_PLAN", error: `Las secuencias del tipo ${type} no son contiguas.` };
      }
    }
  }

  try {
    const docs = await db.$transaction(async (tx) => {
      const created: MhTestMaterializedDoc[] = [];
      for (const [type, list] of byType) {
        const reserved = await reserveDteControlNumberBlock(tx, {
          tenant_id:          scope.tenantId,
          location_id:        scope.locationId,
          issuer_config_id:   issuer.id,
          environment:        "TEST",
          dte_type_code:      type,
          cod_estable_mh:     issuer.cod_estable_mh!,
          cod_punto_venta_mh: issuer.cod_punto_venta_mh!,
        }, { firstSequence: list[0].plannedSequence, count: list.length });
        if (!reserved.ok) {
          throw new MaterializeAbort({
            ok: false,
            code: reserved.code === "FIRST_SEQUENCE_ALREADY_USED" ? "FIRST_SEQUENCE_ALREADY_USED" : "INVALID_PLAN",
            error: `Tipo ${type}: ${reserved.error}`,
            nextAvailable: reserved.next_available != null ? { [type]: reserved.next_available } : undefined,
          });
        }
        const bySeq = new Map(reserved.reserved.map((r) => [r.sequence, r.control_number]));
        for (const it of list) {
          const control_number = bySeq.get(it.plannedSequence)!;
          const generation_code = randomUUID().toUpperCase();
          const doc = await tx.dteOutgoingDocument.create({
            data: {
              tenant_id:              scope.tenantId,
              location_id:            scope.locationId,
              issuer_config_id:       issuer.id,
              dte_type_code:          type,
              environment:            "TEST",
              generation_code,
              control_number,
              transmission_type_code: it.contingency ? "2" : "1",
              contingency_type_code:  it.contingency ? scope.contingency?.contingencyTypeCode ?? null : null,
              contingency_reason:     it.contingency ? scope.contingency?.reason ?? null : null,
              dte_status:             "PENDING_GENERATION",
              retry_count:            0,
              purpose:                DTE_PURPOSE_MH_TEST_CERTIFICATION,
              certification_item_key: it.key,
              created_by:             scope.userId,
              updated_by:             scope.userId,
            },
            select: { id: true },
          });
          created.push({ key: it.key, dteDocumentId: doc.id, controlNumber: control_number, generationCode: generation_code });
        }
      }
      return created;
    });
    return { ok: true, recovered: false, docs };
  } catch (err) {
    // Otra ejecución pudo materializar en paralelo (clave única / piso del
    // correlativo). Si los documentos existen por clave, es una recuperación.
    const after = await readByKeys(db, scope, keys);
    if (after.length === items.length) return { ok: true, recovered: true, docs: toMaterialized(after) };
    if (err instanceof MaterializeAbort) return err.result;
    throw err;
  }
}

// ── Lectura de estado por clave ───────────────────────────────────

export const MH_TEST_DOC_STATE_SELECT = {
  id:                     true,
  certification_item_key: true,
  dte_type_code:          true,
  dte_status:             true,
  control_number:         true,
  generation_code:        true,
  reception_stamp:        true,
  mh_response:            true,
  transmission_type_code: true,
  retry_count:            true,
} as const satisfies Prisma.DteOutgoingDocumentSelect;

export type MhTestDocState = Prisma.DteOutgoingDocumentGetPayload<{ select: typeof MH_TEST_DOC_STATE_SELECT }>;

export async function readMhTestDocByKey(db: PrismaClient, scope: MhTestRuntimeScope, key: string): Promise<MhTestDocState | null> {
  return db.dteOutgoingDocument.findFirst({
    where:  { tenant_id: scope.tenantId, location_id: scope.locationId, ...CERT_WHERE, certification_item_key: key },
    select: MH_TEST_DOC_STATE_SELECT,
  });
}

export type MhTestLogOperation = "SEND" | "INVALIDATE" | "CONTINGENCY_TRANSMIT";

/**
 * Último intento registrado de una operación MH sobre el documento. Sirve
 * para clasificar un fallo técnico: solo un *_AUTH_FAILED (el adapter falla
 * al obtener el token, ANTES de enviar el documento/evento) es un fallo
 * pre-envío verificable; todo lo demás se trata como incierto.
 */
export async function readLastMhLog(db: PrismaClient, dteDocumentId: string, operation: MhTestLogOperation): Promise<{ attempt: number; errorCode: string | null; count: number }> {
  const [last, count] = await Promise.all([
    db.dteTransmissionLog.findFirst({
      where:   { dte_document_id: dteDocumentId, operation_type: operation },
      orderBy: [{ attempt_number: "desc" }, { created_at: "desc" }],
      select:  { attempt_number: true, response_body: true },
    }),
    db.dteTransmissionLog.count({ where: { dte_document_id: dteDocumentId, operation_type: operation } }),
  ]);
  const body = (last?.response_body ?? null) as { errorCode?: unknown } | null;
  return { attempt: last?.attempt_number ?? 0, errorCode: typeof body?.errorCode === "string" ? body.errorCode : null, count };
}

// ── Generación del JSON (escenarios sintéticos) ───────────────────

export type MhTestStepResult = { ok: true; skipped?: boolean } | { ok: false; error: string; code?: string };

export async function generateMhTestDocumentJson(
  db: PrismaClient,
  scope: MhTestRuntimeScope & { userId: string | null },
  input: { key: string; scenario: MhTestScenarioCode; index: number; receptors: MhTestReceptors; now?: Date },
): Promise<MhTestStepResult> {
  const doc = await db.dteOutgoingDocument.findFirst({
    where:  { tenant_id: scope.tenantId, location_id: scope.locationId, ...CERT_WHERE, certification_item_key: input.key },
    select: { id: true, dte_status: true, control_number: true, generation_code: true, transmission_type_code: true, contingency_type_code: true, contingency_reason: true },
  });
  if (!doc) return { ok: false, error: "Documento de prueba no encontrado por clave.", code: "DOC_NOT_FOUND" };
  if (doc.dte_status !== "PENDING_GENERATION") return { ok: true, skipped: true };

  const issuer = await loadMhTestIssuer(db, scope);
  if (!issuer) return { ok: false, error: "Emisor TEST no encontrado.", code: "ISSUER_NOT_FOUND" };
  const resolved = await resolveMhTestBuildContext(db, issuer, new Set([input.scenario]), input.receptors);
  if (!resolved.ok) return { ok: false, error: resolved.errors.join(" · "), code: "CONTEXT_INVALID" };

  const now = input.now ?? new Date();
  const built = buildMhTestScenarioJson(resolved.context, input.scenario, {
    control_number:         doc.control_number!,
    generation_code:        doc.generation_code!,
    transmission_type_code: doc.transmission_type_code,
    contingency_type_code:  doc.contingency_type_code,
    contingency_reason:     doc.contingency_reason,
  }, input.index, now);
  if (!built.ok) return { ok: false, error: built.error, code: "BUILD_FAILED" };

  await db.dteOutgoingDocument.updateMany({
    where: { id: doc.id, dte_status: "PENDING_GENERATION", ...CERT_WHERE },
    data:  { json_document: built.json as Prisma.InputJsonValue, dte_status: "GENERATED", generated_at: now, updated_by: scope.userId },
  });
  return { ok: true };
}

// ── NC 05 sobre CCFE aceptado ─────────────────────────────────────

export const MH_TEST_NC_REASON = "Prueba de certificación MH (ambiente TEST) — nota de crédito total.";

export async function prepareMhTestCreditNote(
  db: PrismaClient,
  scope: MhTestRuntimeScope & { userId: string | null },
  input: { ncKey: string; ccfeKey: string },
): Promise<MhTestStepResult> {
  const [nc, ccfe] = await Promise.all([
    db.dteOutgoingDocument.findFirst({
      where:  { tenant_id: scope.tenantId, location_id: scope.locationId, ...CERT_WHERE, certification_item_key: input.ncKey, dte_type_code: "05" },
      select: { id: true, dte_status: true },
    }),
    db.dteOutgoingDocument.findFirst({
      where:  { tenant_id: scope.tenantId, location_id: scope.locationId, ...CERT_WHERE, certification_item_key: input.ccfeKey, dte_type_code: "03" },
      select: { id: true, dte_status: true, json_document: true },
    }),
  ]);
  if (!nc || !ccfe) return { ok: false, error: "NC o CCFE de prueba no encontrado por clave.", code: "DOC_NOT_FOUND" };
  if (nc.dte_status !== "PENDING_GENERATION") return { ok: true, skipped: true };
  if (ccfe.dte_status !== "ACCEPTED") return { ok: false, error: `El CCFE relacionado no está ACCEPTED (${ccfe.dte_status}).`, code: "CCFE_NOT_ACCEPTED" };

  const existing = await db.dteDocumentRelation.findFirst({
    where:  { source_dte_document_id: nc.id, relation_type: "CREDIT_NOTE_OF" },
    select: { related_dte_document_id: true },
  });
  if (existing && existing.related_dte_document_id !== ccfe.id) {
    return { ok: false, error: "La NC de prueba ya está relacionada con otro documento.", code: "RELATION_MISMATCH" };
  }
  if (!existing) {
    const total = ((ccfe.json_document as Record<string, unknown> | null)?.resumen as Record<string, unknown> | undefined)?.totalPagar;
    await db.dteDocumentRelation.create({
      data: {
        tenant_id:               scope.tenantId,
        location_id:             scope.locationId,
        source_dte_document_id:  nc.id,
        related_dte_document_id: ccfe.id,
        relation_type:           "CREDIT_NOTE_OF",
        reason_code:             null,
        reason_text:             MH_TEST_NC_REASON,
        amount:                  typeof total === "number" && total > 0 ? new Prisma.Decimal(total) : null,
        created_by:              scope.userId,
      },
    });
  }
  // userId solo se escribe en updated_by (FK nullable): null = sin actor runtime (Control Plane).
  const gen = await generateNcJsonForDte({ dteDocumentId: nc.id, userId: scope.userId as string, tenantId: scope.tenantId, locationId: scope.locationId }, db);
  return gen.ok ? { ok: true } : { ok: false, error: gen.message, code: "NC_GENERATION_FAILED" };
}

/** Cancela un documento de prueba que nunca se firmó (p. ej. NC cuyo CCFE fue rechazado). */
export async function cancelUnsignedMhTestDocument(db: PrismaClient, scope: MhTestRuntimeScope & { userId: string | null }, key: string): Promise<boolean> {
  const res = await db.dteOutgoingDocument.updateMany({
    where: {
      tenant_id: scope.tenantId, location_id: scope.locationId, ...CERT_WHERE, certification_item_key: key,
      dte_status: { in: ["PENDING_GENERATION", "GENERATED", "SCHEMA_VALIDATED"] },
    },
    data:  { dte_status: "CANCELLED", updated_by: scope.userId },
  });
  return res.count === 1;
}

// ── Recuperación de eventos ───────────────────────────────────────

/**
 * Evento de invalidación del documento de prueba, en CUALQUIER estado.
 * Los documentos de pruebas solo los opera el motor del Control Plane, así
 * que un evento existente (incluso RECHAZADO) es la verdad a sincronizar:
 * el motor nunca crea un segundo evento si ya existe uno.
 */
export async function findMhTestInvalidationEvent(db: PrismaClient, scope: MhTestRuntimeScope, dteDocumentId: string, eventId: string | null) {
  return db.dteInvalidationEvent.findFirst({
    where:   { tenant_id: scope.tenantId, location_id: scope.locationId, dte_document_id: dteDocumentId, ...(eventId ? { id: eventId } : {}) },
    orderBy: { created_at: "desc" },
    select:  { id: true, status: true, mh_sello_recibido: true },
  });
}

/** Evento de contingencia (cualquier estado) que reporta alguno de los documentos de la corrida. */
export async function findMhTestContingencyEvent(db: PrismaClient, scope: MhTestRuntimeScope, dteDocumentIds: string[], eventId: string | null) {
  if (eventId) {
    return db.dteContingencyEvent.findFirst({
      where:  { id: eventId, tenant_id: scope.tenantId, location_id: scope.locationId },
      select: { id: true, status: true, mh_sello_recibido: true },
    });
  }
  if (dteDocumentIds.length === 0) return null;
  const item = await db.dteContingencyEventItem.findFirst({
    where:   { dte_document_id: { in: dteDocumentIds }, contingency_event: { tenant_id: scope.tenantId, location_id: scope.locationId } },
    orderBy: { contingency_event: { created_at: "desc" } },
    select:  { contingency_event: { select: { id: true, status: true, mh_sello_recibido: true } } },
  });
  return item?.contingency_event ?? null;
}

/** fecEmi/horEmi (America/El_Salvador) de los documentos de contingencia, para el período del Evento. */
export async function readMhTestEmissionWindow(db: PrismaClient, scope: MhTestRuntimeScope, keys: string[]) {
  const rows = await db.dteOutgoingDocument.findMany({
    where:  { tenant_id: scope.tenantId, location_id: scope.locationId, ...CERT_WHERE, certification_item_key: { in: keys } },
    select: { id: true, json_document: true, dte_status: true },
  });
  const stamps: string[] = [];
  for (const r of rows) {
    const ident = (r.json_document as Record<string, unknown> | null)?.identificacion as { fecEmi?: string; horEmi?: string } | undefined;
    if (ident?.fecEmi && ident?.horEmi) stamps.push(`${ident.fecEmi} ${ident.horEmi}`);
  }
  stamps.sort();
  return { ids: rows.map((r) => r.id), statuses: rows.map((r) => r.dte_status), first: stamps[0] ?? null, last: stamps[stamps.length - 1] ?? null, complete: stamps.length === keys.length && rows.length === keys.length };
}
