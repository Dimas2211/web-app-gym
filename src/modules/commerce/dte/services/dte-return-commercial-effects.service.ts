// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-return-commercial-effects.service.ts
//
// MH20 (Fase 7, IMP20-030) — efectos comerciales de un Evento de Retorno
// (tipoDte 18) ACEPTADO por Hacienda.
//
// Separa explícitamente:
//   1. Retorno fiscal          → lo gobierna el ciclo DteReturnEvent (no aquí).
//   2. Devolución física       → RETURN_IN (venta 01/11) / RETURN_OUT (FSE 14)
//                                 vía recordInventoryMovement (servicio canónico),
//                                 solo líneas stockables y solo si se pide.
//   3. Reembolso monetario     → REFUND_OUT (venta) / MANUAL_IN (FSE) vía
//                                 recordCashMovement en una sesión OPEN, solo si
//                                 se pide (nunca se asume movimiento de dinero).
//   4. Ajuste CxC / 5. CxP     → NOT_SUPPORTED: el repositorio no tiene módulo
//                                 de cuentas por cobrar/pagar. Se reporta, no se
//                                 inventa.
//   6. Reportes                → el Retorno queda trazable por sí mismo; la
//                                 venta original NO se modifica ni se invalida.
//
// Reglas:
//   - Precondición fiscal: Retorno ACCEPTED con sello y sin invalidación
//     SENT/ACCEPTED. Antes de eso no hay efectos definitivos.
//   - Nunca invalida el DTE original ni toca correlativos.
//   - Idempotencia por marcador por efecto:
//       inventario: reference_entity "dte_return_event",
//                   reference_id "<returnId>:<no_item>";
//       caja:       reference "DTE-RET:<generation_code>".
//     Un efecto ya aplicado se reporta ALREADY_APPLIED y no se repite.
//   - Los servicios canónicos abren su propia transacción y no se pueden
//     componer en una sola. Por eso cada efecto es atómico por sí mismo y el
//     resultado agregado puede ser PARTIAL: la evidencia lista aplicados,
//     omitidos y fallidos, y re-ejecutar el servicio (reconciliación) aplica
//     solo los faltantes.
//   - Ambiente TEST: sin efectos comerciales salvo opt-in explícito.
//
// Limitación conocida: dos ejecuciones simultáneas del mismo Retorno podrían
// competir entre el chequeo del marcador y el registro. La operación es
// manual (una acción de operador); se documenta como riesgo residual
// (07-implementation-report.md §Riesgos).
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { recordInventoryMovement as realRecordInventoryMovement } from "@/modules/commerce/inventory/services/inventory-movement.service";
import { recordCashMovement as realRecordCashMovement } from "@/modules/commerce/cash/services/cash-movement.service";

export const RETURN_INVENTORY_REFERENCE_ENTITY = "dte_return_event";

export function returnInventoryReferenceId(returnId: string, noItem: number): string {
  return `${returnId}:${noItem}`;
}

export function returnCashReference(generationCode: string): string {
  return `DTE-RET:${generationCode}`;
}

export interface ReturnCommercialEffectsRequest {
  tenantId:    string;
  locationId:  string;
  returnId:    string;
  performedBy: string;
  /** Devolución física: "ALL_STOCKABLE" o lista de no_item del Retorno. Omitido → sin inventario. */
  restock?: "ALL_STOCKABLE" | number[] | null;
  /** Reembolso monetario. Omitido → sin movimiento de dinero. */
  refund?: { cashSessionId: string; amount?: number } | null;
  /** Solicitudes de ajuste CxC/CxP: se reportan NOT_SUPPORTED. */
  receivableAdjustment?: boolean;
  payableAdjustment?:    boolean;
  /** Solo para pruebas controladas: permite efectos sobre un Retorno de ambiente TEST. */
  allowTestEnvironment?: boolean;
}

export type ReturnEffectKind = "INVENTORY" | "CASH" | "RECEIVABLE" | "PAYABLE";
export type ReturnEffectStatus =
  | "APPLIED"
  | "ALREADY_APPLIED"
  | "SKIPPED_NOT_STOCKABLE"
  | "SKIPPED_NOT_REQUESTED"
  | "NOT_SUPPORTED"
  | "FAILED";

export interface ReturnEffectRecord {
  kind:   ReturnEffectKind;
  key:    string;
  status: ReturnEffectStatus;
  detail?: string;
}

export type ReturnCommercialEffectsErrorCode =
  | "RETURN_NOT_FOUND"
  | "RETURN_NOT_ACCEPTED"
  | "RETURN_INVALIDATED_OR_PENDING"
  | "TEST_ENVIRONMENT_NO_EFFECTS"
  | "REFUND_AMOUNT_INVALID";

export type ReturnCommercialEffectsResult =
  | { ok: false; code: ReturnCommercialEffectsErrorCode; message: string }
  | {
      ok: true;
      /** COMPLETE: nada falló. PARTIAL: hay FAILED → re-ejecutar para reconciliar. */
      outcome: "COMPLETE" | "PARTIAL";
      effects: ReturnEffectRecord[];
      /** Siempre false: el DTE original no se invalida ni se modifica. */
      originalDteModified: false;
    };

export interface ReturnCommercialEffectsDeps {
  recordInventoryMovement: typeof realRecordInventoryMovement;
  recordCashMovement:      typeof realRecordCashMovement;
}

interface SourceLine {
  productId:   string;
  stockable:   boolean;
  unitCost?:   number;
}

type Side = "SALE" | "PURCHASE";

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(String(v));
}

export async function applyReturnCommercialEffects(
  req: ReturnCommercialEffectsRequest,
  db: PrismaClient = prisma,
  deps: Partial<ReturnCommercialEffectsDeps> = {},
): Promise<ReturnCommercialEffectsResult> {
  const recordInventoryMovement = deps.recordInventoryMovement ?? realRecordInventoryMovement;
  const recordCashMovement      = deps.recordCashMovement ?? realRecordCashMovement;
  const { tenantId, locationId, returnId, performedBy } = req;

  const ret = await db.dteReturnEvent.findFirst({
    where:   { id: returnId, tenant_id: tenantId, location_id: locationId },
    include: { items: true, invalidation_events: { select: { status: true } } },
  });
  if (!ret) return { ok: false, code: "RETURN_NOT_FOUND", message: "Evento de Retorno no encontrado en este tenant/location." };

  if (ret.status !== "ACCEPTED" || !ret.mh_sello_recibido) {
    return {
      ok: false, code: "RETURN_NOT_ACCEPTED",
      message: "El Retorno no está aceptado por Hacienda (sin sello). No se aplican efectos comerciales definitivos.",
    };
  }
  if (ret.invalidation_events.some((i) => i.status === "ACCEPTED" || i.status === "SENT" || i.status === "SIGNED")) {
    return {
      ok: false, code: "RETURN_INVALIDATED_OR_PENDING",
      message: "El Retorno tiene una invalidación firmada, enviada o aceptada. Reconciliar antes de aplicar efectos.",
    };
  }
  if (ret.environment !== "PRODUCTION" && !req.allowTestEnvironment) {
    return {
      ok: false, code: "TEST_ENVIRONMENT_NO_EFFECTS",
      message: "Retorno de ambiente TEST: no genera efectos comerciales reales.",
    };
  }

  const totalReturned = num(ret.total_returned);
  if (req.refund) {
    const amount = req.refund.amount ?? totalReturned;
    if (!(amount > 0) || amount > totalReturned + 0.005) {
      return {
        ok: false, code: "REFUND_AMOUNT_INVALID",
        message: `El reembolso debe ser > 0 y no exceder el total retornado (${totalReturned.toFixed(2)}).`,
      };
    }
  }

  const side: Side = ret.origin_dte_type_code === "14" ? "PURCHASE" : "SALE";
  const effects: ReturnEffectRecord[] = [];

  // ── Inventario ──────────────────────────────────────────────────
  const docIds = [...new Set(ret.items.map((i) => i.dte_document_id))];
  const docs = docIds.length
    ? await db.dteOutgoingDocument.findMany({
        where:  { id: { in: docIds }, tenant_id: tenantId },
        select: { id: true, sale_id: true, purchase_id: true },
      })
    : [];
  const docById = new Map(docs.map((d) => [d.id, d]));
  const purchaseLinesCache = new Map<string, { product_id: string; dte_line_number: number | null; unit_cost?: unknown }[]>();

  async function resolveSourceLine(dteDocumentId: string, sourceItemNo: number): Promise<SourceLine | null> {
    const doc = docById.get(dteDocumentId);
    if (!doc) return null;
    if (side === "SALE") {
      if (!doc.sale_id) return null;
      const si = await db.saleItem.findFirst({
        where:  { sale_id: doc.sale_id, line_number: sourceItemNo },
        select: { product_id: true, is_stockable_snapshot: true },
      });
      return si ? { productId: si.product_id, stockable: si.is_stockable_snapshot } : null;
    }
    if (!doc.purchase_id) return null;
    let lines = purchaseLinesCache.get(doc.purchase_id);
    if (!lines) {
      lines = await db.purchaseItem.findMany({
        where:   { purchase_id: doc.purchase_id },
        select:  { product_id: true, dte_line_number: true },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
      });
      purchaseLinesCache.set(doc.purchase_id, lines);
    }
    const line = lines.find((l, idx) => (l.dte_line_number ?? idx + 1) === sourceItemNo);
    if (!line) return null;
    const product = await db.product.findFirst({
      where:  { id: line.product_id, tenant_id: tenantId },
      select: { is_stockable: true },
    });
    return { productId: line.product_id, stockable: !!product?.is_stockable };
  }

  const restockSet = req.restock === "ALL_STOCKABLE" ? null : new Set(req.restock ?? []);
  for (const item of [...ret.items].sort((a, b) => a.no_item - b.no_item)) {
    const key = returnInventoryReferenceId(ret.id, item.no_item);
    if (!req.restock || (restockSet && !restockSet.has(item.no_item))) {
      effects.push({ kind: "INVENTORY", key, status: "SKIPPED_NOT_REQUESTED" });
      continue;
    }
    try {
      const existing = await db.inventoryMovement.findFirst({
        where:  { tenant_id: tenantId, location_id: locationId, reference_entity: RETURN_INVENTORY_REFERENCE_ENTITY, reference_id: key },
        select: { id: true },
      });
      if (existing) { effects.push({ kind: "INVENTORY", key, status: "ALREADY_APPLIED" }); continue; }

      const src = await resolveSourceLine(item.dte_document_id, item.source_item_no);
      if (!src) { effects.push({ kind: "INVENTORY", key, status: "FAILED", detail: "Línea original no encontrada (venta/compra vinculada)." }); continue; }
      if (!src.stockable) { effects.push({ kind: "INVENTORY", key, status: "SKIPPED_NOT_STOCKABLE" }); continue; }

      const pl = await db.productLocation.findFirst({
        where:  { tenant_id: tenantId, location_id: locationId, product_id: src.productId },
        select: { id: true },
      });
      if (!pl) { effects.push({ kind: "INVENTORY", key, status: "FAILED", detail: "El producto no está habilitado en esta location." }); continue; }

      const r = await recordInventoryMovement(tenantId, locationId, performedBy, {
        product_location_id: pl.id,
        movement_type:       side === "SALE" ? "RETURN_IN" : "RETURN_OUT",
        quantity:            num(item.quantity),
        reference_entity:    RETURN_INVENTORY_REFERENCE_ENTITY,
        reference_id:        key,
        reference_code:      ret.generation_code,
        notes:               `Retorno DTE ${ret.generation_code} (ítem ${item.no_item})`,
      }, db);
      effects.push(r.ok ? { kind: "INVENTORY", key, status: "APPLIED" } : { kind: "INVENTORY", key, status: "FAILED", detail: r.error });
    } catch (e) {
      effects.push({ kind: "INVENTORY", key, status: "FAILED", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  // ── Caja ────────────────────────────────────────────────────────
  const cashKey = returnCashReference(ret.generation_code);
  if (!req.refund) {
    effects.push({ kind: "CASH", key: cashKey, status: "SKIPPED_NOT_REQUESTED" });
  } else {
    try {
      const existing = await db.cashMovement.findFirst({
        where:  { tenant_id: tenantId, location_id: locationId, reference: cashKey },
        select: { id: true },
      });
      if (existing) {
        effects.push({ kind: "CASH", key: cashKey, status: "ALREADY_APPLIED" });
      } else {
        const r = await recordCashMovement({
          tenant_id: tenantId, location_id: locationId,
          cash_session_id: req.refund.cashSessionId,
          movement_type:   side === "SALE" ? "REFUND_OUT" : "MANUAL_IN",
          amount:          req.refund.amount ?? totalReturned,
          reason:          side === "SALE" ? "Reembolso por Retorno DTE" : "Reintegro por Retorno de FSE",
          reference:       cashKey,
          performed_by:    performedBy,
        }, db);
        effects.push(r.ok ? { kind: "CASH", key: cashKey, status: "APPLIED" } : { kind: "CASH", key: cashKey, status: "FAILED", detail: r.error });
      }
    } catch (e) {
      effects.push({ kind: "CASH", key: cashKey, status: "FAILED", detail: e instanceof Error ? e.message : String(e) });
    }
  }

  // ── CxC / CxP ──────────────────────────────────────────────────
  if (req.receivableAdjustment) {
    effects.push({ kind: "RECEIVABLE", key: `${ret.id}:AR`, status: "NOT_SUPPORTED", detail: "No existe módulo de cuentas por cobrar." });
  }
  if (req.payableAdjustment) {
    effects.push({ kind: "PAYABLE", key: `${ret.id}:AP`, status: "NOT_SUPPORTED", detail: "No existe módulo de cuentas por pagar." });
  }

  return {
    ok: true,
    outcome: effects.some((e) => e.status === "FAILED") ? "PARTIAL" : "COMPLETE",
    effects,
    originalDteModified: false,
  };
}
