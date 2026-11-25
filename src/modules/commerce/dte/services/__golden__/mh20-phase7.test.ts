// MH20 — Fase 7: efectos comerciales del Retorno, datos maestros (vista previa
// territorial y códigos AT) y caracterización COR-01. Todo con mocks: sin BD.

import { describe, it, expect, vi } from "vitest";
import {
  applyReturnCommercialEffects,
  returnCashReference,
  returnInventoryReferenceId,
} from "../dte-return-commercial-effects.service";
import { previewMhTerritory, listMhTerritoryCombinations } from "../../utils/mh-territory-combinations";
import { mhIssuerCodesWarnings } from "../../utils/mh-issuer-codes";

type Mov = { reference_entity?: string; reference_id?: string; reference?: string };

function makeDb(opts: {
  status?: string; sello?: string | null; environment?: string; origin?: string;
  invalidations?: { status: string }[]; stockable?: boolean; withProductLocation?: boolean;
}) {
  const inventory: Mov[] = [];
  const cash: Mov[] = [];
  const ret = {
    id: "ret-1", tenant_id: "t1", location_id: "l1", generation_code: "GEN-RET-1",
    status: opts.status ?? "ACCEPTED", mh_sello_recibido: opts.sello === undefined ? "SELLO" : opts.sello,
    environment: opts.environment ?? "PRODUCTION", origin_dte_type_code: opts.origin ?? "01",
    total_returned: "11.30",
    invalidation_events: opts.invalidations ?? [],
    items: [
      { no_item: 2, dte_document_id: "dte-1", source_item_no: 2, quantity: "1" },
      { no_item: 1, dte_document_id: "dte-1", source_item_no: 1, quantity: "2" },
    ],
  };
  const db = {
    dteReturnEvent: { findFirst: vi.fn(async ({ where }: any) => (where.tenant_id === "t1" && where.location_id === "l1" ? ret : null)) },
    dteOutgoingDocument: { findMany: vi.fn(async () => [{ id: "dte-1", sale_id: "sale-1", purchase_id: "pur-1" }]) },
    saleItem: {
      findFirst: vi.fn(async ({ where }: any) => ({
        product_id: `p${where.line_number}`,
        // línea 2 = servicio no stockable
        is_stockable_snapshot: where.line_number === 1 ? (opts.stockable ?? true) : false,
      })),
    },
    purchaseItem: { findMany: vi.fn(async () => [{ product_id: "p1", dte_line_number: 1 }, { product_id: "p2", dte_line_number: null }]) },
    product: { findFirst: vi.fn(async ({ where }: any) => ({ is_stockable: where.id === "p1" })) },
    productLocation: { findFirst: vi.fn(async () => (opts.withProductLocation === false ? null : { id: "pl-1" })) },
    inventoryMovement: {
      findFirst: vi.fn(async ({ where }: any) =>
        inventory.find((m) => m.reference_entity === where.reference_entity && m.reference_id === where.reference_id) ?? null),
    },
    cashMovement: { findFirst: vi.fn(async ({ where }: any) => cash.find((m) => m.reference === where.reference) ?? null) },
  };
  const deps = {
    recordInventoryMovement: vi.fn(async (_t: string, _l: string, _u: string, input: any) => {
      inventory.push({ reference_entity: input.reference_entity, reference_id: input.reference_id });
      return { ok: true as const };
    }),
    recordCashMovement: vi.fn(async (p: any) => {
      cash.push({ reference: p.reference });
      return { ok: true as const, data: {} as any };
    }),
  };
  return { db: db as any, deps: deps as any, inventory, cash };
}

const base = { tenantId: "t1", locationId: "l1", returnId: "ret-1", performedBy: "u1" };

describe("Fase 7 — efectos comerciales del Retorno (IMP20-030)", () => {
  it("rechaza un Retorno no aceptado o sin sello (sin efectos)", async () => {
    for (const o of [{ status: "SENT" }, { sello: null }]) {
      const { db, deps } = makeDb(o);
      const r = await applyReturnCommercialEffects({ ...base, restock: "ALL_STOCKABLE" }, db, deps);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("RETURN_NOT_ACCEPTED");
      expect(deps.recordInventoryMovement).not.toHaveBeenCalled();
    }
  });

  it("rechaza si el Retorno tiene invalidación firmada/enviada/aceptada", async () => {
    const { db, deps } = makeDb({ invalidations: [{ status: "SENT" }] });
    const r = await applyReturnCommercialEffects({ ...base, restock: "ALL_STOCKABLE" }, db, deps);
    expect(r.ok === false && r.code).toBe("RETURN_INVALIDATED_OR_PENDING");
  });

  it("respeta el scope tenant/location", async () => {
    const { db, deps } = makeDb({});
    const r = await applyReturnCommercialEffects({ ...base, locationId: "otra" }, db, deps);
    expect(r.ok === false && r.code).toBe("RETURN_NOT_FOUND");
  });

  it("TEST: sin efectos salvo opt-in explícito", async () => {
    const { db, deps } = makeDb({ environment: "TEST" });
    const r = await applyReturnCommercialEffects({ ...base, restock: "ALL_STOCKABLE" }, db, deps);
    expect(r.ok === false && r.code).toBe("TEST_ENVIRONMENT_NO_EFFECTS");
    const r2 = await applyReturnCommercialEffects({ ...base, restock: "ALL_STOCKABLE", allowTestEnvironment: true }, db, deps);
    expect(r2.ok).toBe(true);
  });

  it("sin solicitud explícita no mueve inventario ni dinero", async () => {
    const { db, deps } = makeDb({});
    const r = await applyReturnCommercialEffects(base, db, deps);
    expect(r.ok).toBe(true);
    expect(deps.recordInventoryMovement).not.toHaveBeenCalled();
    expect(deps.recordCashMovement).not.toHaveBeenCalled();
    if (r.ok) {
      expect(r.effects.every((e) => e.status === "SKIPPED_NOT_REQUESTED")).toBe(true);
      expect(r.originalDteModified).toBe(false);
    }
  });

  it("venta: RETURN_IN solo para stockables + REFUND_OUT; segunda ejecución idempotente", async () => {
    const { db, deps, inventory, cash } = makeDb({});
    const req = { ...base, restock: "ALL_STOCKABLE" as const, refund: { cashSessionId: "cs-1" } };
    const r = await applyReturnCommercialEffects(req, db, deps);
    expect(r.ok && r.outcome).toBe("COMPLETE");
    expect(deps.recordInventoryMovement).toHaveBeenCalledTimes(1);
    const inv = (deps.recordInventoryMovement.mock.calls as any)[0][3];
    expect(inv.movement_type).toBe("RETURN_IN");
    expect(inv.quantity).toBe(2);
    expect(inv.reference_id).toBe(returnInventoryReferenceId("ret-1", 1));
    const cashCall = (deps.recordCashMovement.mock.calls as any)[0][0];
    expect(cashCall.movement_type).toBe("REFUND_OUT");
    expect(cashCall.amount).toBeCloseTo(11.3);
    expect(cashCall.reference).toBe(returnCashReference("GEN-RET-1"));
    if (r.ok) expect(r.effects.find((e) => e.key === "ret-1:2")?.status).toBe("SKIPPED_NOT_STOCKABLE");

    const again = await applyReturnCommercialEffects(req, db, deps);
    expect(deps.recordInventoryMovement).toHaveBeenCalledTimes(1);
    expect(deps.recordCashMovement).toHaveBeenCalledTimes(1);
    expect(inventory).toHaveLength(1);
    expect(cash).toHaveLength(1);
    if (again.ok) {
      expect(again.effects.find((e) => e.key === "ret-1:1")?.status).toBe("ALREADY_APPLIED");
      expect(again.effects.find((e) => e.kind === "CASH")?.status).toBe("ALREADY_APPLIED");
    }
  });

  it("FSE (14): RETURN_OUT + MANUAL_IN; línea por dte_line_number con fallback idx+1", async () => {
    const { db, deps } = makeDb({ origin: "14" });
    const r = await applyReturnCommercialEffects({ ...base, restock: "ALL_STOCKABLE", refund: { cashSessionId: "cs-1", amount: 5 } }, db, deps);
    expect(r.ok).toBe(true);
    expect((deps.recordInventoryMovement.mock.calls as any)[0][3].movement_type).toBe("RETURN_OUT");
    expect((deps.recordCashMovement.mock.calls as any)[0][0].movement_type).toBe("MANUAL_IN");
    if (r.ok) expect(r.effects.find((e) => e.key === "ret-1:2")?.status).toBe("SKIPPED_NOT_STOCKABLE");
  });

  it("reembolso mayor al total retornado se rechaza antes de cualquier efecto", async () => {
    const { db, deps } = makeDb({});
    const r = await applyReturnCommercialEffects({ ...base, restock: "ALL_STOCKABLE", refund: { cashSessionId: "cs-1", amount: 50 } }, db, deps);
    expect(r.ok === false && r.code).toBe("REFUND_AMOUNT_INVALID");
    expect(deps.recordInventoryMovement).not.toHaveBeenCalled();
  });

  it("fallo parcial deja evidencia PARTIAL y la re-ejecución reconcilia solo lo faltante", async () => {
    const { db, deps } = makeDb({});
    deps.recordCashMovement.mockResolvedValueOnce({ ok: false, error: "No hay sesión de caja abierta." });
    const req = { ...base, restock: "ALL_STOCKABLE" as const, refund: { cashSessionId: "cs-x" } };
    const r1 = await applyReturnCommercialEffects(req, db, deps);
    expect(r1.ok && r1.outcome).toBe("PARTIAL");
    if (r1.ok) expect(r1.effects.find((e) => e.kind === "CASH")?.status).toBe("FAILED");
    const r2 = await applyReturnCommercialEffects(req, db, deps);
    expect(r2.ok && r2.outcome).toBe("COMPLETE");
    expect(deps.recordInventoryMovement).toHaveBeenCalledTimes(1);
    expect(deps.recordCashMovement).toHaveBeenCalledTimes(2);
  });

  it("producto sin ProductLocation → FAILED (no inventa stock); CxC/CxP NOT_SUPPORTED", async () => {
    const { db, deps } = makeDb({ withProductLocation: false });
    const r = await applyReturnCommercialEffects({ ...base, restock: [1], receivableAdjustment: true, payableAdjustment: true }, db, deps);
    expect(r.ok && r.outcome).toBe("PARTIAL");
    if (r.ok) {
      expect(r.effects.find((e) => e.key === "ret-1:1")?.status).toBe("FAILED");
      expect(r.effects.find((e) => e.key === "ret-1:2")?.status).toBe("SKIPPED_NOT_REQUESTED");
      expect(r.effects.filter((e) => e.status === "NOT_SUPPORTED")).toHaveLength(2);
    }
    expect(deps.recordInventoryMovement).not.toHaveBeenCalled();
  });
});

describe("Fase 7 — datos maestros (IMP20-028 / IMP20-011)", () => {
  it("vista previa: sin dirección, incompleta, inexistente", () => {
    expect(previewMhTerritory({ deptCode: null, municipalityCode: null }, "MH_2_0").status).toBe("NO_ADDRESS");
    expect(previewMhTerritory({ deptCode: "06", municipalityCode: null }, "MH_2_0")).toMatchObject({ status: "INVALID", code: "INCOMPLETE" });
    expect(previewMhTerritory({ deptCode: "06", municipalityCode: "ZZZZ" }, "MH_2_0")).toMatchObject({ status: "INVALID", code: "NOT_FOUND" });
  });

  it("vista previa: Cabañas marca cambio respecto de 1.2 sin modificar el registro", () => {
    const combos = listMhTerritoryCombinations("MH_2_0").filter((c) => c.departamento === "09");
    expect(combos.length).toBe(9);
    const este = combos.find((c) => c.municipio === "10")!;
    const p20 = previewMhTerritory({ deptCode: este.storedDeptCode, municipalityCode: este.storedMunicipalityCode }, "MH_2_0");
    const p12 = previewMhTerritory({ deptCode: este.storedDeptCode, municipalityCode: este.storedMunicipalityCode }, "MH_1_2");
    expect(p20).toMatchObject({ status: "OK", changedFromV1_2: true });
    expect(p12.status === "OK" && p12.territory.municipio).toBe("11");
  });

  it("vista previa: dirección ordinaria proyecta sin revisión de cambio", () => {
    const c = listMhTerritoryCombinations("MH_2_0").find((x) => x.departamento === "06")!;
    const p = previewMhTerritory({ deptCode: c.storedDeptCode, municipalityCode: c.storedMunicipalityCode }, "MH_2_0");
    expect(p).toMatchObject({ status: "OK", changedFromV1_2: false });
  });

  it("códigos AT de establecimiento/punto de venta: advertencias no bloqueantes", () => {
    expect(mhIssuerCodesWarnings({ cod_estable_mh: "M001", cod_punto_venta_mh: "P001" })).toEqual([]);
    expect(mhIssuerCodesWarnings({ cod_estable_mh: null, cod_punto_venta_mh: null })).toHaveLength(2);
    expect(mhIssuerCodesWarnings({ cod_estable_mh: "0001", cod_punto_venta_mh: "X1" }).length).toBe(2);
  });
});

import { mapReturnEventForDte, getReturnEventsByDte } from "../../queries/get-return-events-by-dte";

describe("Fase 7 — reportes: trazabilidad del Retorno por DTE", () => {
  const ev = {
    id: "r1", generation_code: "G1", status: "ACCEPTED", environment: "PRODUCTION",
    event_json: { identificacion: { fecEmi: "2026-12-31" } },
    accepted_at: new Date("2027-01-01T05:00:00Z"), created_at: new Date("2027-01-01T04:00:00Z"),
    items: [
      { no_item: 2, source_item_no: 3, quantity: "1", returned_amount: "5.00", returned_tax: "0.65" },
      { no_item: 1, source_item_no: 1, quantity: "2", returned_amount: "4.00", returned_tax: "0.52" },
    ],
  };
  it("fecha/periodo fiscal desde fecEmi, no desde timestamps administrativos", () => {
    const r = mapReturnEventForDte(ev);
    expect(r.fiscalDate).toBe("2026-12-31");
    expect(r.fiscalPeriod).toBe("2026-12");
    expect(r.createdAt.getUTCFullYear()).toBe(2027);
    expect(r.returnedAmount).toBe(9);
    expect(r.returnedTax).toBeCloseTo(1.17);
    expect(r.items.map((i) => i.noItem)).toEqual([1, 2]);
    expect(r.countsForTotals).toBe(true);
  });
  it("no aceptado no cuenta para acumulados; JSON sin fecEmi → periodo null", () => {
    const r = mapReturnEventForDte({ ...ev, status: "SENT", event_json: null });
    expect(r.countsForTotals).toBe(false);
    expect(r.fiscalPeriod).toBeNull();
  });
  it("consulta con scope tenant/location y filtro por DTE", async () => {
    const findMany = vi.fn(async () => [ev]);
    const rows = await getReturnEventsByDte({ dteId: "d1", tenantId: "t1", locationId: "l1", client: { dteReturnEvent: { findMany } } as any });
    expect(rows).toHaveLength(1);
    const arg = (findMany.mock.calls as any)[0][0];
    expect(arg.where).toMatchObject({ tenant_id: "t1", location_id: "l1", items: { some: { dte_document_id: "d1" } } });
  });
});

import { mh20IssuerCodesError, ensureMh20ReadyBeforeReservation } from "../mh20-pre-reservation-guard";

describe("Fase 7 — validación 2.0 antes de reservar correlativo (§11)", () => {
  it("MH_1_2 nunca bloquea por códigos AT (comportamiento histórico)", () => {
    expect(mh20IssuerCodesError("MH_1_2", { cod_estable_mh: "0001", cod_punto_venta_mh: "0001" })).toBeNull();
  });
  it("MH_2_0 exige estructura AT", () => {
    expect(mh20IssuerCodesError("MH_2_0", { cod_estable_mh: "M001", cod_punto_venta_mh: "P001" })).toBeNull();
    expect(mh20IssuerCodesError("MH_2_0", { cod_estable_mh: "0001", cod_punto_venta_mh: "P001" })).toMatch(/no se reservó correlativo/);
  });
  it("interruptor OFF: perfil MH_1_2 sin consultar la BD", async () => {
    const findFirst = vi.fn();
    const r = await ensureMh20ReadyBeforeReservation({ dteIssuerConfig: { findFirst } } as any, {
      issuerConfigId: "ic", tenantId: "t", locationId: "l", environment: "TEST", kind: "01",
      cod_estable_mh: "0001", cod_punto_venta_mh: "0001",
    });
    expect(r).toEqual({ ok: true, profile: "MH_1_2" });
    expect(findFirst).not.toHaveBeenCalled();
  });
});
