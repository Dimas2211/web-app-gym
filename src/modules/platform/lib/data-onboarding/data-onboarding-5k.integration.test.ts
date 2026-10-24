// ─────────────────────────────────────────────────────────────────
// platform/lib/data-onboarding — data-onboarding-5k.integration.test.ts
//
// ONBOARDING-5K. Certificación contra PostgreSQL REAL desechable (todas
// las migraciones aplicadas con psql). Reutiliza el arnés certificado de
// GYM-BOOKINGS (solo 127.0.0.1 con puerto ≠ 5432, data_directory
// verificado, bases zolvi_it2b_* propias que se borran al final). Sin
// GYM_BOOKING_IT_ADMIN_URL / GYM_BOOKING_IT_DATA_DIR se omite.
//
// Ejecuta el mismo camino server-side que runDataOnboardingImport tras
// sus guardas de sesión/organización: parser → análisis DB-aware →
// verificación de cobertura → runner (dry-run y EXECUTE) — con Prisma y
// PostgreSQL reales. Nunca usa .env, DATABASE_URL ni DIRECT_URL.
// ─────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  createItDatabase,
  disconnectAdmin,
  IT_ENABLED,
  type ItDatabase,
} from "@/modules/classes/booking/testing/pg-it-harness";
import { parseDataOnboardingWorkbook, DataOnboardingRowLimitError } from "./excel-preview-parser";
import { analyzeDataOnboardingPreviewAgainstDatabase } from "./db-aware-preview-analyzer";
import { analysisCoverageError } from "./data-onboarding-coverage";
import { runCategoriesImport } from "./import-runners/categories-import-runner";
import { runLinesImport } from "./import-runners/lines-import-runner";
import { runSublinesImport } from "./import-runners/sublines-import-runner";
import { runCustomersImport } from "./import-runners/customers-import-runner";
import { runSuppliersImport } from "./import-runners/suppliers-import-runner";
import { runProductsImport } from "./import-runners/products-import-runner";
import { runInventoryImport } from "./import-runners/inventory-import-runner";
import { runGymClientsImport } from "./import-runners/gym-clients-import-runner";
import { runGymTrainersImport } from "./import-runners/gym-trainers-import-runner";
import type { CommercialEnforcementContext } from "../../runtime/commercial-enforcement";
import type { DataOnboardingDbAwarePreviewResult, DataOnboardingPreviewResult } from "../../types/platform.types";
import {
  ONBOARDING_DATASETS,
  FIXTURE_DEPS,
  buildWorkbookBuffer,
  fixtureRow,
  type OnboardingDataset,
} from "./testing/onboarding-5k-fixtures";

const SIZES = [199, 200, 201, 500, 999, 1000, 1001, 2000, 2500, 5000];
const METRICS: Record<string, unknown>[] = [];

// ── Contexto comercial (Bloque B) ─────────────────────────────────

function commercialCtx(tenantId: string, productsLimit: number | "unlimited"): CommercialEnforcementContext {
  return {
    mode:           "MANAGED",
    tenantId,
    organizationId: `org-${tenantId}`,
    planId:         "plan-5k",
    verticalId:     null,
    effectiveModules: new Map(),
    effectiveEntitlements: new Map([[
      "commerce.products.max",
      {
        entitlement_definition_id: "ent-products-max",
        code:          "commerce.products.max",
        name:          "Productos",
        category:      "commerce",
        value_type:    "NUMBER",
        period_type:   "NONE",
        numeric_value: productsLimit === "unlimited" ? null : productsLimit,
        is_unlimited:  productsLimit === "unlimited",
        source:        "PLAN",
      } as never,
    ]]),
    organizationTimezone: "America/El_Salvador",
  };
}

// ── Siembra por tenant (fresh tenant_id por corrida = CREATE_ONLY limpio) ──

async function ensureGlobalUnit(db: PrismaClient) {
  const found = await db.unitOfMeasure.findFirst({ where: { symbol: FIXTURE_DEPS.unitSymbol } });
  if (!found) await db.unitOfMeasure.create({ data: { name: FIXTURE_DEPS.unitName, symbol: FIXTURE_DEPS.unitSymbol } });
}

async function seedTenant(db: PrismaClient, tenantId: string, dataset: OnboardingDataset, n: number) {
  await ensureGlobalUnit(db);
  await db.runtimeTenant.create({ data: { id: tenantId, name: `IT ${tenantId}`, slug: tenantId } });
  const category = await db.productCategory.create({
    data: { tenant_id: tenantId, code: "CATEGORIA_BASE", name: FIXTURE_DEPS.categoryName },
  });
  await db.productLine.create({
    data: { tenant_id: tenantId, category_id: category.id, code: "LINEA_BASE", name: FIXTURE_DEPS.lineName },
  });
  let gymId: string | null = null;
  if (dataset === "gym_clients" || dataset === "gym_trainers") {
    const gym = await db.gym.create({ data: { tenant_id: tenantId, name: `Gym ${tenantId}`, slug: `gym-${tenantId}` } });
    gymId = gym.id;
  }
  await db.branch.create({ data: { tenant_id: tenantId, gym_id: gymId, name: FIXTURE_DEPS.branchName } });

  if (dataset === "inventory_initial") {
    const unit = await db.unitOfMeasure.findFirstOrThrow({ where: { symbol: FIXTURE_DEPS.unitSymbol } });
    const products = Array.from({ length: n }, (_, k) => ({
      tenant_id:      tenantId,
      product_code:   String(fixtureRow("inventory_initial", k + 1)[0]),
      name:           `Producto inventario ${k + 1}`,
      product_type:   "PRODUCT" as const,
      status:         "ACTIVE" as const,
      is_stockable:   true,
      allow_purchase: true,
      allow_sale:     true,
      category_id:    category.id,
      unit_id:        unit.id,
    }));
    for (let i = 0; i < products.length; i += 1000) {
      await db.product.createMany({ data: products.slice(i, i + 1000) });
    }
  }
}

/** Registros IMPORTADOS para el tenant (excluye la siembra). */
async function countImported(db: PrismaClient, dataset: OnboardingDataset, tenantId: string): Promise<number> {
  switch (dataset) {
    case "categories":        return db.productCategory.count({ where: { tenant_id: tenantId, NOT: { code: "CATEGORIA_BASE" } } });
    case "lines":             return db.productLine.count({ where: { tenant_id: tenantId, NOT: { code: "LINEA_BASE" } } });
    case "sublines":          return db.productSubline.count({ where: { tenant_id: tenantId } });
    case "customers":         return db.customer.count({ where: { tenant_id: tenantId } });
    case "suppliers":         return db.supplier.count({ where: { tenant_id: tenantId } });
    case "products":          return db.product.count({ where: { tenant_id: tenantId } });
    case "inventory_initial": {
      const [pl, mv] = await Promise.all([
        db.productLocation.count({ where: { tenant_id: tenantId } }),
        db.inventoryMovement.count({ where: { tenant_id: tenantId, movement_type: "INITIAL_LOAD" } }),
      ]);
      expect(pl, "ProductLocation = movimientos INITIAL_LOAD").toBe(mv);
      return pl;
    }
    case "gym_clients":       return db.client.count({ where: { tenant_id: tenantId } });
    case "gym_trainers":      return db.trainer.count({ where: { tenant_id: tenantId } });
  }
}

interface RunArgs {
  db:            PrismaClient;
  dataset:       OnboardingDataset;
  tenantId:      string;
  parsedPreview: DataOnboardingPreviewResult;
  dbAwareResult: DataOnboardingDbAwarePreviewResult;
  isDryRun:      boolean;
  productsLimit?: number | "unlimited";
}

function runRunner(a: RunArgs): Promise<{ created?: number; wouldCreate?: number; blocked?: number; totalRows: number }> {
  const base = { parsedPreview: a.parsedPreview, dbAwareResult: a.dbAwareResult, prismaClient: a.db, tenantId: a.tenantId, isDryRun: a.isDryRun };
  switch (a.dataset) {
    case "categories":        return runCategoriesImport(base);
    case "lines":             return runLinesImport(base);
    case "sublines":          return runSublinesImport(base);
    case "customers":         return runCustomersImport(base);
    case "suppliers":         return runSuppliersImport(base);
    case "products":          return runProductsImport({ ...base, commercialCtx: commercialCtx(a.tenantId, a.productsLimit ?? "unlimited") });
    case "inventory_initial": return runInventoryImport({ ...base, performedBy: null });
    case "gym_clients":       return runGymClientsImport(base);
    case "gym_trainers":      return runGymTrainersImport(base);
  }
}

function analyze(db: PrismaClient, dataset: OnboardingDataset, tenantId: string, parsedPreview: DataOnboardingPreviewResult) {
  return analyzeDataOnboardingPreviewAgainstDatabase({
    datasetKey:   dataset,
    parsedPreview,
    importPolicy: "CREATE_ONLY",
    prismaClient: db,
    tenantId,
    ...(dataset === "gym_clients" ? { gymOptions: { classesModuleEnabled: true } } : {}),
  });
}

/** Camino completo con mediciones. Devuelve las métricas de la corrida. */
async function importFile(db: PrismaClient, dataset: OnboardingDataset, tenantId: string, buffer: Buffer, opts: { productsLimit?: number | "unlimited" } = {}) {
  const t0 = performance.now();
  const parsedPreview = parseDataOnboardingWorkbook({ datasetKey: dataset, fileBuffer: buffer });
  const t1 = performance.now();
  const dbAwareResult = await analyze(db, dataset, tenantId, parsedPreview);
  const t2 = performance.now();
  expect(analysisCoverageError(parsedPreview, dbAwareResult)).toBeNull();
  const dry = await runRunner({ db, dataset, tenantId, parsedPreview, dbAwareResult, isDryRun: true, ...opts });
  const t3 = performance.now();
  const imp = await runRunner({ db, dataset, tenantId, parsedPreview, dbAwareResult, isDryRun: false, ...opts });
  const t4 = performance.now();
  return {
    parsedPreview, dbAwareResult, dry, imp,
    ms: { parse: Math.round(t1 - t0), analyze: Math.round(t2 - t1), dryRun: Math.round(t3 - t2), execute: Math.round(t4 - t3), total: Math.round(t4 - t0) },
  };
}

// ── Inyección de fallos sobre el cliente REAL (la transacción es real) ──

function withFault(db: PrismaClient, fault: { failOnCreateMany?: number; delayAfterFirstMs?: number; txTimeoutMs?: number }): PrismaClient {
  let calls = 0;
  const wrapTx = (tx: object) =>
    new Proxy(tx, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (value && typeof value === "object" && "createMany" in value) {
          return new Proxy(value, {
            get(model, key, r) {
              if (key !== "createMany") return Reflect.get(model, key, r);
              return async (args: unknown) => {
                calls += 1;
                if (fault.failOnCreateMany === calls) throw new Error(`FALLA INYECTADA en el lote ${calls}`);
                const res = await (model as { createMany: (a: unknown) => Promise<unknown> }).createMany(args);
                if (fault.delayAfterFirstMs && calls === 1) await new Promise((s) => setTimeout(s, fault.delayAfterFirstMs));
                return res;
              };
            },
          });
        }
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "$transaction") {
        return (fn: (tx: object) => Promise<unknown>, opts?: Record<string, unknown>) =>
          target.$transaction((tx) => fn(wrapTx(tx)), { ...opts, ...(fault.txTimeoutMs ? { timeout: fault.txTimeoutMs } : {}) } as never);
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as PrismaClient;
}

// ─────────────────────────────────────────────────────────────────

describe.skipIf(!IT_ENABLED)("Data Onboarding 5K — PostgreSQL real", () => {
  let shared: ItDatabase;
  let db: PrismaClient;

  beforeAll(async () => {
    shared = await createItDatabase();
    db = shared.db;
  }, 300_000);

  afterAll(async () => {
    if (METRICS.length) console.log(`ONBOARDING5K_METRICS ${JSON.stringify(METRICS)}`);
    await shared?.drop();
    await disconnectAdmin();
  }, 120_000);

  for (const dataset of ONBOARDING_DATASETS) {
    it(`${dataset}: analiza, simula e inserta exactamente N en ${SIZES.join(", ")}; reintento bloqueado`, async () => {
      for (const n of SIZES) {
        const tenantId = `t5k-${dataset}-${n}`;
        await seedTenant(db, tenantId, dataset, n);
        const buffer = buildWorkbookBuffer(dataset, n);
        const r = await importFile(db, dataset, tenantId, buffer);

        expect(r.parsedPreview.summary.totalRows, `${dataset} n=${n} total`).toBe(n);
        expect(r.dbAwareResult.summary.analyzedRows, `${dataset} n=${n} analizadas`).toBe(n);
        expect(r.dbAwareResult.summary.createRows, `${dataset} n=${n} a crear`).toBe(n);
        expect(r.dbAwareResult.summary.errorRows).toBe(0);
        expect(r.dry.wouldCreate, `${dataset} n=${n} dry-run`).toBe(n);
        expect(r.dry.blocked).toBe(0);
        expect(r.imp.created, `${dataset} n=${n} creados (runner)`).toBe(n);
        expect(await countImported(db, dataset, tenantId), `${dataset} n=${n} insertados (PostgreSQL)`).toBe(n);

        // Reintento del MISMO archivo ya importado → CREATE_ONLY lo bloquea entero.
        const retryAnalysis = await analyze(db, dataset, tenantId, r.parsedPreview);
        expect(retryAnalysis.summary.analyzedRows).toBe(n);
        expect(retryAnalysis.summary.createRows, `${dataset} n=${n} reintento sin filas creables`).toBe(0);
        expect(await countImported(db, dataset, tenantId), "el reintento no escribe").toBe(n);

        if (n === 500 || n === 2500 || n === 5000) METRICS.push({ dataset, n, ...r.ms });
      }
    }, 900_000);
  }

  it("5,001 registros → rechazado antes de analizar o escribir", async () => {
    expect(() => parseDataOnboardingWorkbook({ datasetKey: "products", fileBuffer: buildWorkbookBuffer("products", 5001) }))
      .toThrow(DataOnboardingRowLimitError);
  });

  it("duplicados en lotes distintos (filas 10 y 2,400) → análisis bloquea, EXECUTE no escribe nada", async () => {
    const tenantId = "t5k-dup-batches";
    await seedTenant(db, tenantId, "products", 0);
    const buffer = buildWorkbookBuffer("products", 2500, { overrides: { 2400: fixtureRow("products", 10) } });
    const parsed = parseDataOnboardingWorkbook({ datasetKey: "products", fileBuffer: buffer });
    const analysis = await analyze(db, "products", tenantId, parsed);
    expect(analysis.summary.analyzedRows).toBe(2500);
    expect(analysis.summary.errorRows).toBe(1);
    await expect(runRunner({ db, dataset: "products", tenantId, parsedPreview: parsed, dbAwareResult: analysis, isDryRun: false }))
      .rejects.toThrow();
    expect(await countImported(db, "products", tenantId)).toBe(0);
  }, 300_000);

  it("fallo intermedio (lote 4 de 10) → rollback total en PostgreSQL", async () => {
    for (const dataset of ["customers", "products", "inventory_initial", "gym_clients", "gym_trainers"] as const) {
      const tenantId = `t5k-fault-${dataset}`;
      await seedTenant(db, tenantId, dataset, 5000);
      const parsed = parseDataOnboardingWorkbook({ datasetKey: dataset, fileBuffer: buildWorkbookBuffer(dataset, 5000) });
      const analysis = await analyze(db, dataset, tenantId, parsed);
      await expect(
        runRunner({ db: withFault(db, { failOnCreateMany: 4 }), dataset, tenantId, parsedPreview: parsed, dbAwareResult: analysis, isDryRun: false }),
      ).rejects.toThrow(/FALLA INYECTADA en el lote 4/);
      expect(await countImported(db, dataset, tenantId), `${dataset}: sin filas tras el fallo`).toBe(0);

      // Recuperación: el reintento limpio importa exactamente todo.
      const ok = await runRunner({ db, dataset, tenantId, parsedPreview: parsed, dbAwareResult: analysis, isDryRun: false });
      expect(ok.created).toBe(5000);
      expect(await countImported(db, dataset, tenantId)).toBe(5000);
    }
  }, 900_000);

  it("timeout de la transacción a mitad de la escritura → rollback total", async () => {
    const tenantId = "t5k-timeout";
    await seedTenant(db, tenantId, "categories", 0);
    const parsed = parseDataOnboardingWorkbook({ datasetKey: "categories", fileBuffer: buildWorkbookBuffer("categories", 5000) });
    const analysis = await analyze(db, "categories", tenantId, parsed);
    await expect(
      runRunner({
        db: withFault(db, { txTimeoutMs: 1_000, delayAfterFirstMs: 2_000 }),
        dataset: "categories", tenantId, parsedPreview: parsed, dbAwareResult: analysis, isDryRun: false,
      }),
    ).rejects.toThrow();
    expect(await countImported(db, "categories", tenantId)).toBe(0);
  }, 300_000);

  it("restricción comercial: 2,500 productos con límite 2,000 → bloqueado (dry-run y EXECUTE), nada escrito; con límite 2,500 → exactamente 2,500", async () => {
    const tenantId = "t5k-capacity";
    await seedTenant(db, tenantId, "products", 0);
    const parsed = parseDataOnboardingWorkbook({ datasetKey: "products", fileBuffer: buildWorkbookBuffer("products", 2500) });
    const analysis = await analyze(db, "products", tenantId, parsed);
    const args = { db, dataset: "products" as const, tenantId, parsedPreview: parsed, dbAwareResult: analysis };
    await expect(runRunner({ ...args, isDryRun: true, productsLimit: 2000 })).rejects.toThrow(/límite/);
    await expect(runRunner({ ...args, isDryRun: false, productsLimit: 2000 })).rejects.toThrow(/límite/);
    expect(await countImported(db, "products", tenantId)).toBe(0);

    const ok = await runRunner({ ...args, isDryRun: false, productsLimit: 2500 });
    expect(ok.created).toBe(2500);
    expect(await countImported(db, "products", tenantId)).toBe(2500);

    // Ya en el límite: 1 producto más → bloqueado.
    const one = parseDataOnboardingWorkbook({ datasetKey: "products", fileBuffer: buildWorkbookBuffer("products", 1, { tag: "Z" }) });
    const oneAnalysis = await analyze(db, "products", tenantId, one);
    await expect(runRunner({ db, dataset: "products", tenantId, parsedPreview: one, dbAwareResult: oneAnalysis, isDryRun: false, productsLimit: 2500 }))
      .rejects.toThrow(/límite/);
    expect(await countImported(db, "products", tenantId)).toBe(2500);
  }, 300_000);

  it("aislamiento Shared: el mismo archivo en dos organizaciones de la misma base → cada tenant recibe exactamente N", async () => {
    for (const dataset of ["customers", "products", "gym_clients"] as const) {
      const [ta, tb] = [`t5k-iso-a-${dataset}`, `t5k-iso-b-${dataset}`];
      await seedTenant(db, ta, dataset, 2500);
      await seedTenant(db, tb, dataset, 2500);
      const buffer = buildWorkbookBuffer(dataset, 2500);
      const a = await importFile(db, dataset, ta, buffer);
      expect(a.imp.created).toBe(2500);
      // B no ve los registros de A: análisis limpio con 2,500 CREATE.
      const b = await importFile(db, dataset, tb, buffer);
      expect(b.dbAwareResult.summary.createRows).toBe(2500);
      expect(b.imp.created).toBe(2500);
      expect(await countImported(db, dataset, ta)).toBe(2500);
      expect(await countImported(db, dataset, tb)).toBe(2500);
    }
  }, 900_000);

  it("Dedicated: base propia (otra base PostgreSQL) → 5,000 clientes GYM y 2,500 productos exactos", async () => {
    const dedicated = await createItDatabase();
    try {
      const ddb = dedicated.db;
      const tenantId = "t5k-dedicated";
      await seedTenant(ddb, tenantId, "gym_clients", 0);
      const clients = await importFile(ddb, "gym_clients", tenantId, buildWorkbookBuffer("gym_clients", 5000));
      expect(clients.imp.created).toBe(5000);
      expect(await countImported(ddb, "gym_clients", tenantId)).toBe(5000);
      const products = await importFile(ddb, "products", tenantId, buildWorkbookBuffer("products", 2500), { productsLimit: 2500 });
      expect(products.imp.created).toBe(2500);
      expect(await countImported(ddb, "products", tenantId)).toBe(2500);
      // Códigos operativos GYM generados en lote: únicos y sin huecos de colisión.
      const codes = await ddb.client.findMany({ where: { tenant_id: tenantId }, select: { operational_code: true } });
      expect(new Set(codes.map((c) => c.operational_code)).size).toBe(5000);
    } finally {
      await dedicated.drop();
    }
  }, 900_000);
});
