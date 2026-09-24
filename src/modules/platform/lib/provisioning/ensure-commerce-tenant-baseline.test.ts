// ─────────────────────────────────────────────────────────────────
// platform/lib/provisioning — ensure-commerce-tenant-baseline.test.ts
//
// SHARED-OPS-PARITY-1 — baseline Commerce tenant-scoped:
// - COMMERCE_ONLY nuevo crea Tenant + Branch + Admin + baseline + Receipt,
//   Gym = 0, todo en la misma transacción (rollback conjunto).
// - Retry del mismo receipt no duplica nada.
// - Tenant B en la MISMA base física recibe su propio baseline; no
//   reutiliza categorías/tax rate de A.
// - Catálogos globales de la base física no se duplican al provisionar
//   una segunda organización.
// - Reparación idempotente de un tenant ya provisionado sin baseline.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  provisionRuntimeTenant,
  type ProvisionRuntimeTenantInput,
} from "./provision-runtime-tenant";
import {
  ensureCommerceTenantBaseline,
  ensureCommerceTenantBaselineAtomic,
  CommerceBaselineTenantNotFoundError,
} from "./ensure-commerce-tenant-baseline";
import { createRuntimeDb, type InMemoryDb } from "./provisioning-test-harness";

const asClient = (db: InMemoryDb) => db.client as unknown as PrismaClient;

const ADMIN = { email: "admin@example.com", password: "synthetic-pass-123", first_name: "A", last_name: "Admin" };

function commerceInput(key: string, slug: string): ProvisionRuntimeTenantInput {
  return {
    mode: "COMMERCE_ONLY",
    idempotencyKey: key,
    tenantName: slug,
    tenantSlug: slug,
    locationName: "Sede Central",
    admin: ADMIN,
  };
}

function baselineCounts(db: InMemoryDb, tenantId: string) {
  return {
    taxRates:   db.count("taxRate", { tenant_id: tenantId }),
    categories: db.count("productCategory", { tenant_id: tenantId }),
    fiscal:     db.count("tenantFiscalConfig", { tenant_id: tenantId }),
  };
}

function seedGlobalCatalogs(db: InMemoryDb) {
  db.seed("unitOfMeasure", { name: "Unidad", symbol: "UND", status: "active" });
  db.seed("identificationType", { code: "13", name: "DUI" });
  db.seed("economicActivity", { code: "46100", name: "Venta" });
  db.seed("municipality", { code: "0614", name: "San Salvador" });
  db.seed("country", { code: "SV", name: "El Salvador" });
}

function globalCounts(db: InMemoryDb) {
  return {
    units:      db.count("unitOfMeasure"),
    idTypes:    db.count("identificationType"),
    activities: db.count("economicActivity"),
    munis:      db.count("municipality"),
    countries:  db.count("country"),
  };
}

describe("provisionRuntimeTenant — baseline Commerce atómico", () => {
  it("COMMERCE_ONLY nuevo: Tenant + Branch + Admin + baseline + Receipt, Gym = 0", async () => {
    const db = createRuntimeDb();
    const result = await provisionRuntimeTenant(asClient(db), commerceInput("key-a", "tenant-a"));

    expect(db.count("runtimeTenant")).toBe(1);
    expect(db.count("branch", { tenant_id: result.tenantId })).toBe(1);
    expect(db.count("user", { tenant_id: result.tenantId })).toBe(1);
    expect(db.count("runtimeProvisioningReceipt", { tenant_id: result.tenantId })).toBe(1);
    expect(db.count("gym")).toBe(0);

    expect(baselineCounts(db, result.tenantId)).toEqual({ taxRates: 1, categories: 1, fiscal: 1 });
    expect(db.tables.taxRate[0]).toMatchObject({ tenant_id: result.tenantId, name: "IVA", rate: 13 });
    expect(db.tables.productCategory[0]).toMatchObject({ tenant_id: result.tenantId, code: "GENERAL" });
    expect(db.tables.tenantFiscalConfig[0]).toMatchObject({ tenant_id: result.tenantId, is_retention_agent: false });
  });

  it("el baseline usa RuntimeTenant.id como tenant_id (nunca un gym.id) también en MODE GYM", async () => {
    const db = createRuntimeDb();
    const result = await provisionRuntimeTenant(asClient(db), {
      mode: "GYM",
      idempotencyKey: "key-gym",
      tenantName: "Gym",
      tenantSlug: "gym-tenant",
      gymName: "Gym",
      gymSlug: "gym-slug",
      locationName: "Sede",
      admin: ADMIN,
    });
    expect(result.gymId).not.toBeNull();
    expect(baselineCounts(db, result.tenantId)).toEqual({ taxRates: 1, categories: 1, fiscal: 1 });
    expect(db.count("taxRate", { tenant_id: result.gymId })).toBe(0);
  });

  it("fallo al crear el receipt → rollback completo, incluido el baseline", async () => {
    const db = createRuntimeDb();
    db.failNext("runtimeProvisioningReceipt", "create");
    await expect(
      provisionRuntimeTenant(asClient(db), commerceInput("key-a", "tenant-a")),
    ).rejects.toThrow();

    expect(db.count("runtimeTenant")).toBe(0);
    expect(db.count("taxRate")).toBe(0);
    expect(db.count("productCategory")).toBe(0);
    expect(db.count("tenantFiscalConfig")).toBe(0);
  });

  it("fallo en el baseline → no queda receipt ni tenant a medias", async () => {
    const db = createRuntimeDb();
    db.failNext("productCategory", "create");
    await expect(
      provisionRuntimeTenant(asClient(db), commerceInput("key-a", "tenant-a")),
    ).rejects.toThrow();

    expect(db.count("runtimeProvisioningReceipt")).toBe(0);
    expect(db.count("runtimeTenant")).toBe(0);
    expect(db.count("taxRate")).toBe(0);
  });

  it("retry con el mismo receipt → replay sin duplicar TaxRate/ProductCategory/TenantFiscalConfig", async () => {
    const db = createRuntimeDb();
    const first = await provisionRuntimeTenant(asClient(db), commerceInput("key-a", "tenant-a"));
    const second = await provisionRuntimeTenant(asClient(db), commerceInput("key-a", "tenant-a"));

    expect(second).toEqual({ ...first, replayed: true });
    expect(db.count("taxRate")).toBe(1);
    expect(db.count("productCategory")).toBe(1);
    expect(db.count("tenantFiscalConfig")).toBe(1);
  });

  it("tenant B en la misma base física recibe su PROPIO baseline; no reutiliza el de A", async () => {
    const db = createRuntimeDb();
    const a = await provisionRuntimeTenant(asClient(db), commerceInput("key-a", "tenant-a"));
    const b = await provisionRuntimeTenant(asClient(db), commerceInput("key-b", "tenant-b"));

    expect(a.tenantId).not.toBe(b.tenantId);
    expect(baselineCounts(db, a.tenantId)).toEqual({ taxRates: 1, categories: 1, fiscal: 1 });
    expect(baselineCounts(db, b.tenantId)).toEqual({ taxRates: 1, categories: 1, fiscal: 1 });

    const catA = db.tables.productCategory.find((c) => c.tenant_id === a.tenantId)!;
    const catB = db.tables.productCategory.find((c) => c.tenant_id === b.tenantId)!;
    expect(catA.id).not.toBe(catB.id);
    const taxA = db.tables.taxRate.find((t) => t.tenant_id === a.tenantId)!;
    const taxB = db.tables.taxRate.find((t) => t.tenant_id === b.tenantId)!;
    expect(taxA.id).not.toBe(taxB.id);
  });

  it("provisionar organización B en la misma Shared NO duplica catálogos globales", async () => {
    const db = createRuntimeDb();
    seedGlobalCatalogs(db);
    const before = globalCounts(db);

    await provisionRuntimeTenant(asClient(db), commerceInput("key-a", "tenant-a"));
    await provisionRuntimeTenant(asClient(db), commerceInput("key-b", "tenant-b"));

    expect(globalCounts(db)).toEqual(before);
  });
});

describe("ensureCommerceTenantBaseline — reparación de tenants existentes", () => {
  function seedLegacyTenant(db: InMemoryDb, slug: string) {
    return db.seed("runtimeTenant", { name: slug, slug, status: "active" }).id;
  }

  it("tenant sin baseline → crea los 3 items; segunda ejecución → alreadyExisting, sin duplicar", async () => {
    const db = createRuntimeDb();
    const tenantId = seedLegacyTenant(db, "pilot");

    const first = await ensureCommerceTenantBaselineAtomic(asClient(db), tenantId);
    expect(first.created.sort()).toEqual(["PRODUCT_CATEGORY_GENERAL", "TAX_RATE_IVA_13", "TENANT_FISCAL_CONFIG"]);
    expect(first.alreadyExisting).toEqual([]);

    const second = await ensureCommerceTenantBaselineAtomic(asClient(db), tenantId);
    expect(second.created).toEqual([]);
    expect(second.alreadyExisting.sort()).toEqual(["PRODUCT_CATEGORY_GENERAL", "TAX_RATE_IVA_13", "TENANT_FISCAL_CONFIG"]);
    expect(baselineCounts(db, tenantId)).toEqual({ taxRates: 1, categories: 1, fiscal: 1 });
  });

  it("baseline parcial (solo IVA) → crea únicamente lo faltante", async () => {
    const db = createRuntimeDb();
    const tenantId = seedLegacyTenant(db, "pilot");
    db.seed("taxRate", { tenant_id: tenantId, name: "IVA 13", rate: 13, status: "active" });

    const result = await ensureCommerceTenantBaselineAtomic(asClient(db), tenantId);
    expect(result.alreadyExisting).toEqual(["TAX_RATE_IVA_13"]);
    expect(result.created.sort()).toEqual(["PRODUCT_CATEGORY_GENERAL", "TENANT_FISCAL_CONFIG"]);
    expect(db.count("taxRate", { tenant_id: tenantId })).toBe(1);
  });

  it("baseline de OTRO tenant en la misma base no cuenta como existente y no se modifica", async () => {
    const db = createRuntimeDb();
    const tenantA = seedLegacyTenant(db, "a");
    const tenantB = seedLegacyTenant(db, "b");
    await ensureCommerceTenantBaselineAtomic(asClient(db), tenantB);
    const snapshotB = JSON.stringify([
      db.tables.taxRate.filter((r) => r.tenant_id === tenantB),
      db.tables.productCategory.filter((r) => r.tenant_id === tenantB),
      db.tables.tenantFiscalConfig.filter((r) => r.tenant_id === tenantB),
    ]);

    const resultA = await ensureCommerceTenantBaselineAtomic(asClient(db), tenantA);
    expect(resultA.created).toHaveLength(3);
    expect(baselineCounts(db, tenantA)).toEqual({ taxRates: 1, categories: 1, fiscal: 1 });
    expect(JSON.stringify([
      db.tables.taxRate.filter((r) => r.tenant_id === tenantB),
      db.tables.productCategory.filter((r) => r.tenant_id === tenantB),
      db.tables.tenantFiscalConfig.filter((r) => r.tenant_id === tenantB),
    ])).toBe(snapshotB);
  });

  it("dos reparaciones concurrentes del mismo tenant → un solo set (advisory lock)", async () => {
    const db = createRuntimeDb();
    const tenantId = seedLegacyTenant(db, "pilot");
    await Promise.all([
      ensureCommerceTenantBaselineAtomic(asClient(db), tenantId),
      ensureCommerceTenantBaselineAtomic(asClient(db), tenantId),
    ]);
    expect(baselineCounts(db, tenantId)).toEqual({ taxRates: 1, categories: 1, fiscal: 1 });
  });

  it("tenant inexistente → error, sin escrituras", async () => {
    const db = createRuntimeDb();
    await expect(
      ensureCommerceTenantBaseline(asClient(db), "missing-tenant"),
    ).rejects.toBeInstanceOf(CommerceBaselineTenantNotFoundError);
    expect(db.count("taxRate")).toBe(0);
  });
});
