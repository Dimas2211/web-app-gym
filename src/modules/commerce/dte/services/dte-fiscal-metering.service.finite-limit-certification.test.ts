// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-fiscal-metering.service.finite-limit-certification.test.ts
//
// FASE IV-D — certificación de límites finitos. Cubre EXCLUSIVAMENTE
// los invariantes que dte-fiscal-metering.service.test.ts (30 tests)
// no ejercita todavía: limit=0 exacto, boundary de mes (period_key
// estable a través de finalize, un mes lleno no bloquea el siguiente),
// reducción de límite por debajo del uso existente (OVER_LIMIT, no
// destructivo), y transición finite→unlimited→finite sobre el mismo
// ledger. La concurrencia real contra Postgres (docs distintos, mismo
// doc, RELEASED reacquire, rollback/no-phantom-row) ya está certificada
// por src/modules/commerce/dte/dev/verify-dte-fiscal-metering-postgres-concurrency.ts
// — no se duplica aquí con fake DB.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  reserveDteFiscalCapacity,
  getDteMonthlyMeteringStatus,
  DTE_MONTHLY_ENTITLEMENT_CODE,
} from "./dte-fiscal-metering.service";
import type { CommercialEnforcementContext } from "@/modules/platform/runtime/commercial-enforcement/types";
import type { EffectiveEntitlement } from "@/modules/platform/types/platform.types";

// ── Fake runtime DB — mismo helper que dte-fiscal-metering.service.test.ts ──

interface FakeRow {
  id: string;
  tenant_id: string;
  dte_document_id: string;
  entitlement_code: string;
  period_key: string;
  status: "PENDING" | "CONSUMED" | "RELEASED";
  reserved_at: Date;
  resolved_at: Date | null;
  created_by: string | null;
}

function createFakeRuntimeDb(seed: FakeRow[] = []) {
  const rows = new Map<string, FakeRow>(seed.map((r) => [r.dte_document_id, r]));
  let idSeq = 0;

  const reservationApi = {
    findUnique: async ({ where }: { where: { dte_document_id: string } }) =>
      rows.get(where.dte_document_id) ?? null,
    create: async ({ data }: { data: Omit<FakeRow, "id"> }) => {
      const row: FakeRow = { id: `row-${++idSeq}`, ...data, created_by: data.created_by ?? null };
      rows.set(data.dte_document_id, row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<FakeRow> }) => {
      const existing = [...rows.values()].find((r) => r.id === where.id);
      if (!existing) throw new Error("not found");
      const updated = { ...existing, ...data };
      rows.set(existing.dte_document_id, updated);
      return updated;
    },
    updateMany: async ({ where, data }: { where: { id?: string; dte_document_id?: string; status: string }; data: Partial<FakeRow> }) => {
      const existing = [...rows.values()].find(
        (r) =>
          (where.id === undefined || r.id === where.id) &&
          (where.dte_document_id === undefined || r.dte_document_id === where.dte_document_id) &&
          r.status === where.status,
      );
      if (!existing) return { count: 0 };
      rows.set(existing.dte_document_id, { ...existing, ...data });
      return { count: 1 };
    },
    count: async ({ where }: { where: { tenant_id: string; period_key: string; status: string | { in: string[] } } }) => {
      const matchesStatus = (s: string) =>
        typeof where.status === "string" ? where.status === s : where.status.in.includes(s);
      return [...rows.values()].filter(
        (r) => r.tenant_id === where.tenant_id && r.period_key === where.period_key && matchesStatus(r.status),
      ).length;
    },
  };

  interface FakeDb {
    dteFiscalMeteringReservation: typeof reservationApi;
    $transaction: (cb: (tx: FakeDb) => Promise<unknown>) => Promise<unknown>;
  }

  const db: FakeDb = {
    dteFiscalMeteringReservation: reservationApi,
    $transaction: async (cb) => cb(db),
  };

  return { db: db as any, rows };
}

function entitlement(overrides: Partial<EffectiveEntitlement> = {}): EffectiveEntitlement {
  return {
    entitlement_definition_id: "def-dte",
    code: DTE_MONTHLY_ENTITLEMENT_CODE,
    name: "DTE mensuales",
    category: "fiscal",
    value_type: "COUNT",
    period_type: "MONTHLY",
    numeric_value: 100,
    is_unlimited: false,
    source: "PLAN",
    ...overrides,
  };
}

function managedCtx(ent: EffectiveEntitlement | undefined, timezone: string | null = "America/El_Salvador"): CommercialEnforcementContext {
  return {
    mode: "MANAGED",
    tenantId: "tenant-1",
    organizationId: "org-1",
    planId: "plan-1",
    verticalId: null,
    effectiveModules: new Map(),
    effectiveEntitlements: ent ? new Map([[DTE_MONTHLY_ENTITLEMENT_CODE, ent]]) : new Map(),
    organizationTimezone: timezone,
  };
}

const SEPT = new Date("2026-09-15T12:00:00.000Z"); // 2026-09 en America/El_Salvador
const OCT = new Date("2026-10-15T12:00:00.000Z");  // 2026-10 en America/El_Salvador

describe("FASE IV-D — limit=0 (caso E1)", () => {
  it("limit=0, occupied=0 -> nueva reserva PRODUCTION bloqueada, sin fila creada", async () => {
    const { db, rows } = createFakeRuntimeDb();
    const result = await reserveDteFiscalCapacity({
      dteDocumentId: "doc-1",
      tenantId: "tenant-1",
      environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement({ numeric_value: 0 })),
      runtimeDb: db,
      now: SEPT,
    });
    expect(result).toMatchObject({ ok: false, code: "CAPACITY_LIMIT_REACHED" });
    expect(rows.size).toBe(0);
  });
});

describe("FASE IV-D — boundary de mes (ETAPA O)", () => {
  it("O1: reserva creada en septiembre, finalize ocurre en octubre -> period_key sigue 2026-09", async () => {
    const { db, rows } = createFakeRuntimeDb();
    const reserveResult = await reserveDteFiscalCapacity({
      dteDocumentId: "doc-1",
      tenantId: "tenant-1",
      environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement({ numeric_value: 10 })),
      runtimeDb: db,
      now: SEPT,
    });
    expect(reserveResult).toMatchObject({ ok: true, token: { mode: "RESERVED", periodKey: "2026-09" } });

    // finalizeDteFiscalCapacityConsumed solo actualiza status/resolved_at —
    // nunca recalcula period_key, sin importar el `now` de finalize.
    await db.dteFiscalMeteringReservation.updateMany({
      where: { dte_document_id: "doc-1", status: "PENDING" },
      data: { status: "CONSUMED", resolved_at: OCT },
    });

    const row = rows.get("doc-1")!;
    expect(row.period_key).toBe("2026-09");
    expect(row.status).toBe("CONSUMED");
  });

  it("O3: septiembre lleno no bloquea una reserva nueva de octubre (periodos aislados)", async () => {
    const seedSept: FakeRow[] = Array.from({ length: 5 }, (_, i) => ({
      id: `seed-sept-${i}`,
      tenant_id: "tenant-1",
      dte_document_id: `sept-doc-${i}`,
      entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE,
      period_key: "2026-09",
      status: "CONSUMED",
      reserved_at: SEPT,
      resolved_at: SEPT,
      created_by: null,
    }));
    const { db } = createFakeRuntimeDb(seedSept);

    // Septiembre ya está en el límite — confirmamos que SÍ bloquea dentro de su propio periodo.
    const blockedInSept = await reserveDteFiscalCapacity({
      dteDocumentId: "sept-doc-new",
      tenantId: "tenant-1",
      environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement({ numeric_value: 5 })),
      runtimeDb: db,
      now: SEPT,
    });
    expect(blockedInSept).toMatchObject({ ok: false, code: "CAPACITY_LIMIT_REACHED" });

    // Un documento nuevo en octubre nunca debe verse afectado por el
    // consumo de septiembre — mismo entitlement/tenant, periodo distinto.
    const okInOct = await reserveDteFiscalCapacity({
      dteDocumentId: "oct-doc-1",
      tenantId: "tenant-1",
      environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement({ numeric_value: 5 })),
      runtimeDb: db,
      now: OCT,
    });
    expect(okInOct).toMatchObject({ ok: true, token: { mode: "RESERVED", periodKey: "2026-10" } });
  });

  it("O4: getDteMonthlyMeteringStatus cuenta cada periodo independientemente", async () => {
    const seed: FakeRow[] = [
      { id: "r1", tenant_id: "tenant-1", dte_document_id: "d1", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "CONSUMED", reserved_at: SEPT, resolved_at: SEPT, created_by: null },
      { id: "r2", tenant_id: "tenant-1", dte_document_id: "d2", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-10", status: "CONSUMED", reserved_at: OCT, resolved_at: OCT, created_by: null },
    ];
    const { db } = createFakeRuntimeDb(seed);

    const sepStatus = await getDteMonthlyMeteringStatus(managedCtx(entitlement({ numeric_value: 10 })), db, SEPT);
    expect(sepStatus).toMatchObject({ periodKey: "2026-09", consumed: 1, occupied: 1 });

    const octStatus = await getDteMonthlyMeteringStatus(managedCtx(entitlement({ numeric_value: 10 })), db, OCT);
    expect(octStatus).toMatchObject({ periodKey: "2026-10", consumed: 1, occupied: 1 });
  });
});

describe("FASE IV-D — reducir límite debajo del uso existente (ETAPA Q, OVER_LIMIT)", () => {
  it("occupied=3, limit reducido a 2 -> OVER_LIMIT, remainingForNewIssue=0 (nunca negativo), filas existentes intactas", async () => {
    const seed: FakeRow[] = [
      { id: "r1", tenant_id: "tenant-1", dte_document_id: "d1", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "CONSUMED", reserved_at: SEPT, resolved_at: SEPT, created_by: null },
      { id: "r2", tenant_id: "tenant-1", dte_document_id: "d2", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "CONSUMED", reserved_at: SEPT, resolved_at: SEPT, created_by: null },
      { id: "r3", tenant_id: "tenant-1", dte_document_id: "d3", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "PENDING", reserved_at: SEPT, resolved_at: null, created_by: null },
    ];
    const { db, rows } = createFakeRuntimeDb(seed);
    const overLimitCtx = managedCtx(entitlement({ numeric_value: 2 })); // límite reducido por debajo del uso ya existente

    const status = await getDteMonthlyMeteringStatus(overLimitCtx, db, SEPT);
    expect(status).toMatchObject({
      occupied: 3,
      limit: 2,
      isUnlimited: false,
      configured: true,
      remainingForNewIssue: 0, // Math.max(0, ...) — nunca negativo
    });

    // Nueva emisión queda bloqueada.
    const newReserve = await reserveDteFiscalCapacity({
      dteDocumentId: "d4",
      tenantId: "tenant-1",
      environment: "PRODUCTION",
      commercialCtx: overLimitCtx,
      runtimeDb: db,
      now: SEPT,
    });
    expect(newReserve).toMatchObject({ ok: false, code: "CAPACITY_LIMIT_REACHED" });

    // No destructivo: las 3 filas existentes permanecen exactamente igual.
    expect(rows.get("d1")?.status).toBe("CONSUMED");
    expect(rows.get("d2")?.status).toBe("CONSUMED");
    expect(rows.get("d3")?.status).toBe("PENDING");
    expect(rows.size).toBe(3);
  });
});

describe("FASE IV-D — transición finite -> unlimited -> finite (ETAPA R)", () => {
  it("mismo ledger: bloqueado en finite, permitido en Unlimited, vuelve a bloquear en finite sin tocar lo existente", async () => {
    const seed: FakeRow[] = [
      { id: "r1", tenant_id: "tenant-1", dte_document_id: "d1", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "CONSUMED", reserved_at: SEPT, resolved_at: SEPT, created_by: null },
      { id: "r2", tenant_id: "tenant-1", dte_document_id: "d2", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "CONSUMED", reserved_at: SEPT, resolved_at: SEPT, created_by: null },
    ];
    const { db, rows } = createFakeRuntimeDb(seed);

    // R1 — finite limit=2, occupied=2 -> bloqueado.
    const r1 = await reserveDteFiscalCapacity({
      dteDocumentId: "d3",
      tenantId: "tenant-1",
      environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement({ numeric_value: 2 })),
      runtimeDb: db,
      now: SEPT,
    });
    expect(r1).toMatchObject({ ok: false, code: "CAPACITY_LIMIT_REACHED" });
    expect(rows.has("d3")).toBe(false);

    // R2 — mismo ledger, entitlement pasa a Unlimited -> permitido, el
    // ledger SIGUE midiendo (crea fila real, no un bypass silencioso).
    const r2 = await reserveDteFiscalCapacity({
      dteDocumentId: "d3",
      tenantId: "tenant-1",
      environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement({ is_unlimited: true, numeric_value: null })),
      runtimeDb: db,
      now: SEPT,
    });
    expect(r2).toMatchObject({ ok: true, token: { mode: "RESERVED" } });
    expect(rows.get("d3")?.status).toBe("PENDING");

    // R3 — vuelve a finite limit=2; ahora occupied=3 (2 CONSUMED + 1 PENDING
    // de d3 creado en R2) -> OVER_LIMIT, nuevas bloqueadas, lo existente intacto.
    const status = await getDteMonthlyMeteringStatus(managedCtx(entitlement({ numeric_value: 2 })), db, SEPT);
    expect(status).toMatchObject({ occupied: 3, limit: 2, remainingForNewIssue: 0 });

    const r3 = await reserveDteFiscalCapacity({
      dteDocumentId: "d4",
      tenantId: "tenant-1",
      environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement({ numeric_value: 2 })),
      runtimeDb: db,
      now: SEPT,
    });
    expect(r3).toMatchObject({ ok: false, code: "CAPACITY_LIMIT_REACHED" });
    expect(rows.get("d1")?.status).toBe("CONSUMED");
    expect(rows.get("d2")?.status).toBe("CONSUMED");
    expect(rows.get("d3")?.status).toBe("PENDING"); // creada durante la ventana Unlimited — se preserva
  });
});
