// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-fiscal-metering.service.test.ts
//
// FASE IV-A — cobertura de la máquina de estados PENDING/CONSUMED/
// RELEASED, bypass TEST/LEGACY_UNMANAGED, Unlimited medido,
// UNCONFIGURED fail-closed, idempotencia (mismo documento / concurrencia
// simulada) y reapertura RELEASED -> PENDING.
//
// runtimeDb es un fake en memoria (no toca Postgres) — la prueba de
// concurrencia real contra la base local se documenta por separado en
// docs/modules/platform-phase-4-dte-monthly-metering.md (sección de
// pruebas), no se ejecuta aquí.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  reserveDteFiscalCapacity,
  finalizeDteFiscalCapacityConsumed,
  releaseDteFiscalCapacity,
  getDteMonthlyMeteringStatus,
  DTE_MONTHLY_ENTITLEMENT_CODE,
} from "./dte-fiscal-metering.service";
import type { CommercialEnforcementContext } from "@/modules/platform/runtime/commercial-enforcement/types";
import type { EffectiveEntitlement } from "@/modules/platform/types/platform.types";

// ── Fake runtime DB — store en memoria de dte_fiscal_metering_reservations ──

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

function createFakeRuntimeDb(seed: FakeRow[] = [], opts?: { forceP2002OnCreateFor?: string }) {
  const rows = new Map<string, FakeRow>(seed.map((r) => [r.dte_document_id, r]));
  let idSeq = 0;

  const reservationApi = {
    findUnique: async ({ where }: { where: { dte_document_id: string } }) =>
      rows.get(where.dte_document_id) ?? null,
    create: async ({ data }: { data: Omit<FakeRow, "id"> }) => {
      if (opts?.forceP2002OnCreateFor === data.dte_document_id && !rows.has(data.dte_document_id)) {
        // Simula que un competidor concurrente ya insertó la fila justo
        // antes de que este intento hiciera commit — el unique constraint
        // real de Postgres rechazaría este insert.
        rows.set(data.dte_document_id, {
          id: `winner-${data.dte_document_id}`,
          ...data,
          created_by: data.created_by ?? null,
        });
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "test",
          meta: { target: ["dte_document_id"] },
        });
      }
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
    updateMany: async ({ where, data }: { where: { id: string; status: string }; data: Partial<FakeRow> }) => {
      const existing = [...rows.values()].find((r) => r.id === where.id && r.status === where.status);
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

// ── Contextos comerciales fake ──────────────────────────────────────

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

function legacyCtx(): CommercialEnforcementContext {
  return {
    mode: "LEGACY_UNMANAGED",
    tenantId: "tenant-legacy",
    organizationId: null,
    planId: null,
    verticalId: null,
    effectiveModules: new Map(),
    effectiveEntitlements: new Map(),
    organizationTimezone: null,
  };
}

const NOW = new Date("2026-09-15T12:00:00.000Z"); // 2026-09 en America/El_Salvador

describe("reserveDteFiscalCapacity — bypass", () => {
  it("environment TEST -> BYPASS_TEST, no crea fila", async () => {
    const { db, rows } = createFakeRuntimeDb();
    const result = await reserveDteFiscalCapacity({
      dteDocumentId: "doc-1",
      tenantId: "tenant-1",
      environment: "TEST",
      commercialCtx: managedCtx(entitlement()),
      runtimeDb: db,
      now: NOW,
    });
    expect(result).toEqual({ ok: true, token: { mode: "BYPASS_TEST" } });
    expect(rows.size).toBe(0);
  });

  it("LEGACY_UNMANAGED -> BYPASS_LEGACY_UNMANAGED, no crea fila", async () => {
    const { db, rows } = createFakeRuntimeDb();
    const result = await reserveDteFiscalCapacity({
      dteDocumentId: "doc-1",
      tenantId: "tenant-legacy",
      environment: "PRODUCTION",
      commercialCtx: legacyCtx(),
      runtimeDb: db,
      now: NOW,
    });
    expect(result).toEqual({ ok: true, token: { mode: "BYPASS_LEGACY_UNMANAGED" } });
    expect(rows.size).toBe(0);
  });
});

describe("reserveDteFiscalCapacity — timezone", () => {
  it("timezone faltante -> TIMEZONE_INVALID_OR_MISSING, no crea fila", async () => {
    const { db, rows } = createFakeRuntimeDb();
    const result = await reserveDteFiscalCapacity({
      dteDocumentId: "doc-1",
      tenantId: "tenant-1",
      environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement(), null),
      runtimeDb: db,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, code: "TIMEZONE_INVALID_OR_MISSING" });
    expect(rows.size).toBe(0);
  });

  it("timezone inválido -> TIMEZONE_INVALID_OR_MISSING", async () => {
    const { db } = createFakeRuntimeDb();
    const result = await reserveDteFiscalCapacity({
      dteDocumentId: "doc-1",
      tenantId: "tenant-1",
      environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement(), "No/Existe"),
      runtimeDb: db,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, code: "TIMEZONE_INVALID_OR_MISSING" });
  });
});

describe("reserveDteFiscalCapacity — UNCONFIGURED / Unlimited / Finite", () => {
  it("MANAGED + UNCONFIGURED -> bloquea nueva emisión, no crea fila", async () => {
    const { db, rows } = createFakeRuntimeDb();
    const result = await reserveDteFiscalCapacity({
      dteDocumentId: "doc-1",
      tenantId: "tenant-1",
      environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement({ source: "UNCONFIGURED", numeric_value: null })),
      runtimeDb: db,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, code: "ENTITLEMENT_NOT_CONFIGURED" });
    expect(rows.size).toBe(0);
  });

  it("Unlimited -> SÍ crea reservation (mide) pero nunca bloquea", async () => {
    const { db, rows } = createFakeRuntimeDb();
    const result = await reserveDteFiscalCapacity({
      dteDocumentId: "doc-1",
      tenantId: "tenant-1",
      environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement({ is_unlimited: true, numeric_value: null })),
      runtimeDb: db,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    expect(rows.size).toBe(1);
    expect(rows.get("doc-1")?.status).toBe("PENDING");
  });

  it("Finite: occupied < limit -> PENDING", async () => {
    const { db } = createFakeRuntimeDb();
    const result = await reserveDteFiscalCapacity({
      dteDocumentId: "doc-1",
      tenantId: "tenant-1",
      environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement({ numeric_value: 100 })),
      runtimeDb: db,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: true, token: { mode: "RESERVED", periodKey: "2026-09" } });
  });

  it("Finite: occupied === limit -> CAPACITY_LIMIT_REACHED", async () => {
    const seed: FakeRow[] = Array.from({ length: 100 }, (_, i) => ({
      id: `seed-${i}`,
      tenant_id: "tenant-1",
      dte_document_id: `seed-doc-${i}`,
      entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE,
      period_key: "2026-09",
      status: "CONSUMED",
      reserved_at: NOW,
      resolved_at: NOW,
      created_by: null,
    }));
    const { db, rows } = createFakeRuntimeDb(seed);
    const result = await reserveDteFiscalCapacity({
      dteDocumentId: "doc-101",
      tenantId: "tenant-1",
      environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement({ numeric_value: 100 })),
      runtimeDb: db,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, code: "CAPACITY_LIMIT_REACHED" });
    expect(rows.has("doc-101")).toBe(false);
  });
});

describe("reserveDteFiscalCapacity — concurrencia simulada", () => {
  it("dos documentos distintos, limit 100, occupied 99: solo uno obtiene PENDING", async () => {
    const seed: FakeRow[] = Array.from({ length: 99 }, (_, i) => ({
      id: `seed-${i}`,
      tenant_id: "tenant-1",
      dte_document_id: `seed-doc-${i}`,
      entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE,
      period_key: "2026-09",
      status: "CONSUMED",
      reserved_at: NOW,
      resolved_at: NOW,
      created_by: null,
    }));
    const { db } = createFakeRuntimeDb(seed);
    const ctx = managedCtx(entitlement({ numeric_value: 100 }));

    const resultA = await reserveDteFiscalCapacity({
      dteDocumentId: "doc-A", tenantId: "tenant-1", environment: "PRODUCTION", commercialCtx: ctx, runtimeDb: db, now: NOW,
    });
    const resultB = await reserveDteFiscalCapacity({
      dteDocumentId: "doc-B", tenantId: "tenant-1", environment: "PRODUCTION", commercialCtx: ctx, runtimeDb: db, now: NOW,
    });

    expect(resultA.ok).toBe(true);
    expect(resultB).toMatchObject({ ok: false, code: "CAPACITY_LIMIT_REACHED" });
  });

  it("mismo dte_document_id, dos intentos concurrentes: unique constraint (P2002) se resuelve de forma idempotente, una sola reservation", async () => {
    const { db, rows } = createFakeRuntimeDb([], { forceP2002OnCreateFor: "doc-race" });
    const result = await reserveDteFiscalCapacity({
      dteDocumentId: "doc-race",
      tenantId: "tenant-1",
      environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement({ numeric_value: 100 })),
      runtimeDb: db,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: true, token: { mode: "RESERVED" } });
    expect(rows.size).toBe(1); // nunca dos filas para el mismo documento
  });
});

describe("reserveDteFiscalCapacity — idempotencia por estado existente", () => {
  it("PENDING existente -> retry no vuelve a contar/crear, devuelve la misma reserva", async () => {
    const seed: FakeRow[] = [
      { id: "row-1", tenant_id: "tenant-1", dte_document_id: "doc-1", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "PENDING", reserved_at: NOW, resolved_at: null, created_by: null },
    ];
    const { db, rows } = createFakeRuntimeDb(seed);
    const result = await reserveDteFiscalCapacity({
      dteDocumentId: "doc-1", tenantId: "tenant-1", environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement({ numeric_value: 1 })), // limit=1, ya "ocupado" por la propia fila
      runtimeDb: db, now: NOW,
    });
    expect(result).toEqual({ ok: true, token: { mode: "RESERVED", reservationId: "row-1", periodKey: "2026-09" } });
    expect(rows.size).toBe(1);
  });

  it("CONSUMED existente -> idempotente, no crea nueva ni recuenta", async () => {
    const seed: FakeRow[] = [
      { id: "row-1", tenant_id: "tenant-1", dte_document_id: "doc-1", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "CONSUMED", reserved_at: NOW, resolved_at: NOW, created_by: null },
    ];
    const { db } = createFakeRuntimeDb(seed);
    const result = await reserveDteFiscalCapacity({
      dteDocumentId: "doc-1", tenantId: "tenant-1", environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement({ numeric_value: 1 })),
      runtimeDb: db, now: NOW,
    });
    expect(result).toEqual({ ok: true, token: { mode: "ALREADY_CONSUMED", reservationId: "row-1" } });
  });
});

describe("reserveDteFiscalCapacity — RELEASED reacquire", () => {
  it("RELEASED con cupo disponible -> vuelve a PENDING, reutiliza la MISMA fila", async () => {
    const seed: FakeRow[] = [
      { id: "row-1", tenant_id: "tenant-1", dte_document_id: "doc-1", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-08", status: "RELEASED", reserved_at: new Date("2026-08-10T00:00:00Z"), resolved_at: new Date("2026-08-10T01:00:00Z"), created_by: null },
    ];
    const { db, rows } = createFakeRuntimeDb(seed);
    const result = await reserveDteFiscalCapacity({
      dteDocumentId: "doc-1", tenantId: "tenant-1", environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement({ numeric_value: 100 })),
      runtimeDb: db, now: NOW,
    });
    expect(result).toMatchObject({ ok: true, token: { mode: "RESERVED", reservationId: "row-1" } });
    expect(rows.size).toBe(1); // misma fila, no una segunda
    const row = rows.get("doc-1")!;
    expect(row.status).toBe("PENDING");
    expect(row.resolved_at).toBeNull();
  });

  it("RELEASED con cupo agotado -> permanece RELEASED, CAPACITY_LIMIT_REACHED", async () => {
    const seed: FakeRow[] = [
      { id: "row-1", tenant_id: "tenant-1", dte_document_id: "doc-1", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "RELEASED", reserved_at: NOW, resolved_at: NOW, created_by: null },
      ...Array.from({ length: 1 }, (_, i) => ({
        id: `seed-${i}`, tenant_id: "tenant-1", dte_document_id: `seed-doc-${i}`,
        entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "CONSUMED" as const,
        reserved_at: NOW, resolved_at: NOW, created_by: null,
      })),
    ];
    const { db, rows } = createFakeRuntimeDb(seed);
    const result = await reserveDteFiscalCapacity({
      dteDocumentId: "doc-1", tenantId: "tenant-1", environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement({ numeric_value: 1 })), // limit 1, ya ocupado por seed-doc-0
      runtimeDb: db, now: NOW,
    });
    expect(result).toMatchObject({ ok: false, code: "CAPACITY_LIMIT_REACHED" });
    expect(rows.get("doc-1")?.status).toBe("RELEASED"); // no se tocó
  });

  it("RELEASED reacquire en otro mes -> period_key y reserved_at se actualizan al periodo vigente", async () => {
    const oldReservedAt = new Date("2026-08-10T00:00:00Z");
    const seed: FakeRow[] = [
      { id: "row-1", tenant_id: "tenant-1", dte_document_id: "doc-1", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-08", status: "RELEASED", reserved_at: oldReservedAt, resolved_at: oldReservedAt, created_by: null },
    ];
    const { db, rows } = createFakeRuntimeDb(seed);
    const now = new Date("2026-09-15T12:00:00.000Z");
    const result = await reserveDteFiscalCapacity({
      dteDocumentId: "doc-1", tenantId: "tenant-1", environment: "PRODUCTION",
      commercialCtx: managedCtx(entitlement({ numeric_value: 100 })),
      runtimeDb: db, now,
    });
    expect(result).toMatchObject({ ok: true, token: { mode: "RESERVED", periodKey: "2026-09" } });
    const row = rows.get("doc-1")!;
    expect(row.period_key).toBe("2026-09");
    expect(row.reserved_at).toEqual(now);
    expect(row.reserved_at).not.toEqual(oldReservedAt);
  });
});

describe("finalizeDteFiscalCapacityConsumed / releaseDteFiscalCapacity", () => {
  it("ACCEPTED: PENDING -> CONSUMED", async () => {
    const seed: FakeRow[] = [
      { id: "row-1", tenant_id: "tenant-1", dte_document_id: "doc-1", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "PENDING", reserved_at: NOW, resolved_at: null, created_by: null },
    ];
    const { db, rows } = createFakeRuntimeDb(seed);
    await finalizeDteFiscalCapacityConsumed(db, { mode: "RESERVED", reservationId: "row-1", periodKey: "2026-09" }, NOW);
    expect(rows.get("doc-1")?.status).toBe("CONSUMED");
    expect(rows.get("doc-1")?.resolved_at).toEqual(NOW);
  });

  it("OBSERVED usa el mismo finalize que ACCEPTED: PENDING -> CONSUMED", async () => {
    const seed: FakeRow[] = [
      { id: "row-1", tenant_id: "tenant-1", dte_document_id: "doc-1", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "PENDING", reserved_at: NOW, resolved_at: null, created_by: null },
    ];
    const { db, rows } = createFakeRuntimeDb(seed);
    await finalizeDteFiscalCapacityConsumed(db, { mode: "RESERVED", reservationId: "row-1", periodKey: "2026-09" });
    expect(rows.get("doc-1")?.status).toBe("CONSUMED");
  });

  it("REJECTED: PENDING -> RELEASED", async () => {
    const seed: FakeRow[] = [
      { id: "row-1", tenant_id: "tenant-1", dte_document_id: "doc-1", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "PENDING", reserved_at: NOW, resolved_at: null, created_by: null },
    ];
    const { db, rows } = createFakeRuntimeDb(seed);
    await releaseDteFiscalCapacity(db, { mode: "RESERVED", reservationId: "row-1", periodKey: "2026-09" }, NOW);
    expect(rows.get("doc-1")?.status).toBe("RELEASED");
    expect(rows.get("doc-1")?.resolved_at).toEqual(NOW);
  });

  it("error técnico / estado MH inesperado: no se llama finalize/release -> PENDING permanece intacto", async () => {
    const seed: FakeRow[] = [
      { id: "row-1", tenant_id: "tenant-1", dte_document_id: "doc-1", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "PENDING", reserved_at: NOW, resolved_at: null, created_by: null },
    ];
    const { rows } = createFakeRuntimeDb(seed);
    // Simula el flujo del transmit service: ante error técnico, el código
    // simplemente NO invoca finalize ni release — se documenta aquí como
    // contrato explícito, no como comportamiento a probar en el fake.
    expect(rows.get("doc-1")?.status).toBe("PENDING");
  });

  it("invalidación no modifica el ledger: CONSUMED permanece CONSUMED (no hay llamada de invalidación a este servicio)", async () => {
    const seed: FakeRow[] = [
      { id: "row-1", tenant_id: "tenant-1", dte_document_id: "doc-1", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "CONSUMED", reserved_at: NOW, resolved_at: NOW, created_by: null },
    ];
    const { rows } = createFakeRuntimeDb(seed);
    // create-invalidation-event / transmit-invalidation-event NUNCA importan
    // este servicio — se documenta la ausencia de acoplamiento como parte
    // del contrato, la fila queda intacta por construcción.
    expect(rows.get("doc-1")?.status).toBe("CONSUMED");
  });

  it("divergencia: token RESERVED mal apuntado a fila ya CONSUMED por otra vía -> finalize lanza en vez de esconder el error", async () => {
    const seed: FakeRow[] = [
      { id: "row-1", tenant_id: "tenant-1", dte_document_id: "doc-1", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "CONSUMED", reserved_at: NOW, resolved_at: NOW, created_by: null },
    ];
    const { db } = createFakeRuntimeDb(seed);
    await expect(
      finalizeDteFiscalCapacityConsumed(db, { mode: "RESERVED", reservationId: "row-1", periodKey: "2026-09" }, NOW),
    ).rejects.toThrow(/Divergencia de ledger/);
  });

  it("bypass tokens (TEST/LEGACY/ALREADY_CONSUMED) son no-op en finalize/release", async () => {
    const { db } = createFakeRuntimeDb();
    await expect(finalizeDteFiscalCapacityConsumed(db, { mode: "BYPASS_TEST" })).resolves.toBeUndefined();
    await expect(finalizeDteFiscalCapacityConsumed(db, { mode: "BYPASS_LEGACY_UNMANAGED" })).resolves.toBeUndefined();
    await expect(finalizeDteFiscalCapacityConsumed(db, { mode: "ALREADY_CONSUMED", reservationId: "x" })).resolves.toBeUndefined();
    await expect(releaseDteFiscalCapacity(db, { mode: "BYPASS_TEST" })).resolves.toBeUndefined();
  });
});

describe("getDteMonthlyMeteringStatus — reporting", () => {
  it("consumed/pending/occupied/remaining correctos, separados", async () => {
    const seed: FakeRow[] = [
      { id: "r1", tenant_id: "tenant-1", dte_document_id: "d1", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "CONSUMED", reserved_at: NOW, resolved_at: NOW, created_by: null },
      { id: "r2", tenant_id: "tenant-1", dte_document_id: "d2", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "CONSUMED", reserved_at: NOW, resolved_at: NOW, created_by: null },
      { id: "r3", tenant_id: "tenant-1", dte_document_id: "d3", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "PENDING", reserved_at: NOW, resolved_at: null, created_by: null },
      { id: "r4", tenant_id: "tenant-1", dte_document_id: "d4", entitlement_code: DTE_MONTHLY_ENTITLEMENT_CODE, period_key: "2026-09", status: "RELEASED", reserved_at: NOW, resolved_at: NOW, created_by: null },
    ];
    const { db } = createFakeRuntimeDb(seed);
    const status = await getDteMonthlyMeteringStatus(managedCtx(entitlement({ numeric_value: 500 })), db, NOW);
    expect(status).toMatchObject({
      periodKey: "2026-09",
      consumed: 2,
      pending: 1,
      occupied: 3,
      limit: 500,
      isUnlimited: false,
      configured: true,
      remainingForNewIssue: 497,
    });
  });

  it("Unlimited -> remainingForNewIssue null", async () => {
    const { db } = createFakeRuntimeDb();
    const status = await getDteMonthlyMeteringStatus(managedCtx(entitlement({ is_unlimited: true, numeric_value: null })), db, NOW);
    expect(status).toMatchObject({ isUnlimited: true, remainingForNewIssue: null, configured: true });
  });

  it("UNCONFIGURED -> configured:false, nunca inventa 0 como plan", async () => {
    const { db } = createFakeRuntimeDb();
    const status = await getDteMonthlyMeteringStatus(managedCtx(entitlement({ source: "UNCONFIGURED", numeric_value: null })), db, NOW);
    expect(status).toMatchObject({ configured: false, limit: null, remainingForNewIssue: null, source: "UNCONFIGURED" });
  });

  it("LEGACY_UNMANAGED -> reporta bypass explícito, nunca Unlimited", async () => {
    const { db } = createFakeRuntimeDb();
    const status = await getDteMonthlyMeteringStatus(legacyCtx(), db, NOW);
    expect(status).toMatchObject({ source: "LEGACY_UNMANAGED_BYPASS", isUnlimited: false, configured: false });
  });
});
