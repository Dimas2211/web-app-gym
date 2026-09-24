// ─────────────────────────────────────────────────────────────────
// platform/lib/data-onboarding — data-onboarding-tenant-isolation.test.ts
//
// SHARED-OPS-PARITY-1 — aislamiento Shared OBLIGATORIO.
// Una sola base física (InMemoryDb) con TENANT_A y TENANT_B, usando el
// analizador DB-aware y los runners REALES. Un onboarding de A jamás:
//   - lee/detecta como duplicado un registro de B;
//   - resuelve dependencias (categoría/línea/sublínea/proveedor/impuesto/
//     sucursal/producto) de B;
//   - crea filas con tenant_id de B ni modifica filas de B.
// Los catálogos globales (unidades) sí son compartidos y no se duplican.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { InMemoryDb } from "../provisioning/provisioning-test-harness";
import { analyzeDataOnboardingPreviewAgainstDatabase } from "./db-aware-preview-analyzer";
import { runCategoriesImport } from "./import-runners/categories-import-runner";
import { runLinesImport } from "./import-runners/lines-import-runner";
import { runSublinesImport } from "./import-runners/sublines-import-runner";
import { runSuppliersImport } from "./import-runners/suppliers-import-runner";
import { runCustomersImport } from "./import-runners/customers-import-runner";
import { runProductsImport } from "./import-runners/products-import-runner";
import { runInventoryImport } from "./import-runners/inventory-import-runner";
import type {
  DataOnboardingDatasetKey,
  DataOnboardingPreviewResult,
  DataOnboardingDbAwarePreviewResult,
} from "../../types/platform.types";
import type { CommercialEnforcementContext } from "../../runtime/commercial-enforcement";

const TENANT_A = "TENANT_A";
const TENANT_B = "TENANT_B";

const LEGACY_CTX = (tenantId: string): CommercialEnforcementContext => ({
  mode: "LEGACY_UNMANAGED",
  tenantId,
  organizationId: null,
  planId: null,
  verticalId: null,
  effectiveModules: new Map(),
  effectiveEntitlements: new Map(),
  organizationTimezone: null,
});

function createSharedDb(): InMemoryDb {
  return new InMemoryDb({
    productCategory:   { uniques: [["tenant_id", "code"]] },
    productLine:       { uniques: [["tenant_id", "category_id", "code"]] },
    productSubline:    { uniques: [["tenant_id", "line_id", "code"]] },
    product:           { uniques: [["tenant_id", "product_code"]] },
    unitOfMeasure:     { uniques: [["symbol"]] },
    taxRate:           { uniques: [] },
    supplier:          { uniques: [] },
    customer:          { uniques: [] },
    branch:            { uniques: [] },
    productLocation:   { uniques: [["tenant_id", "product_id", "location_id"]] },
    inventoryMovement: { uniques: [] },
  });
}

const asClient = (db: InMemoryDb) => db.client as unknown as PrismaClient;

function preview(datasetKey: DataOnboardingDatasetKey, rows: Record<string, unknown>[]): DataOnboardingPreviewResult {
  return {
    datasetKey,
    status:  "VALID",
    columns: Object.keys(rows[0] ?? {}),
    summary: { totalRows: rows.length, validRows: rows.length, invalidRows: 0, warningRows: 0, emptyRowsIgnored: 0 },
    rows:    rows.map((data, i) => ({ rowNumber: i + 2, status: "VALID", data, errors: [], warnings: [] })),
  } as DataOnboardingPreviewResult;
}

async function analyze(db: InMemoryDb, datasetKey: DataOnboardingDatasetKey, p: DataOnboardingPreviewResult, tenantId: string) {
  return analyzeDataOnboardingPreviewAgainstDatabase({
    datasetKey,
    parsedPreview: p,
    importPolicy:  "CREATE_ONLY",
    prismaClient:  asClient(db),
    tenantId,
  });
}

function foundIds(result: DataOnboardingDbAwarePreviewResult, type: string): string[] {
  return result.rows.flatMap((r) =>
    r.dependencyChecks.filter((d) => d.dependencyType === type && d.foundId).map((d) => d.foundId as string),
  );
}

function tenantOf(db: InMemoryDb, table: string, id: string) {
  return db.tables[table].find((r) => r.id === id)?.tenant_id;
}

function snapshotTenant(db: InMemoryDb, tenantId: string) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(db.tables).map(([t, rows]) => [t, rows.filter((r) => r.tenant_id === tenantId)]),
    ),
  );
}

let db: InMemoryDb;
let snapshotB: string;

// Tenant B ya tiene EXACTAMENTE los mismos nombres/códigos/NIT que A va a importar.
function seedTenantB(target: InMemoryDb) {
  const cat  = target.seed("productCategory", { tenant_id: TENANT_B, code: "BEB", name: "Bebidas", status: "active" });
  const line = target.seed("productLine", { tenant_id: TENANT_B, category_id: cat.id, code: "GAS", name: "Gaseosas", status: "active" });
  target.seed("productSubline", { tenant_id: TENANT_B, line_id: line.id, code: "COL", name: "Cola", status: "active" });
  target.seed("taxRate", { tenant_id: TENANT_B, name: "IVA", rate: 13, status: "active" });
  target.seed("supplier", { tenant_id: TENANT_B, name: "Distribuidora Uno", nit: "06140101011011", status: "active" });
  target.seed("customer", { tenant_id: TENANT_B, name: "Cliente Uno", nit: null, dui: "012345678", customer_code: "CLI-0001", status: "ACTIVE" });
  const branch = target.seed("branch", { tenant_id: TENANT_B, name: "Sede Central", status: "active" });
  const product = target.seed("product", {
    tenant_id: TENANT_B, product_code: "P-001", sku: "SKU-1", name: "Cola 600ml",
    product_type: "PRODUCT", is_stockable: true, status: "ACTIVE",
  });
  target.seed("productLocation", { tenant_id: TENANT_B, product_id: product.id, location_id: branch.id, current_stock: 5 });
  target.seed("inventoryMovement", { tenant_id: TENANT_B, product_id: product.id, location_id: branch.id, movement_type: "INITIAL_LOAD" });
}

beforeEach(() => {
  db = createSharedDb();
  db.seed("unitOfMeasure", { name: "Unidad", symbol: "UND", status: "active" }); // catálogo global
  seedTenantB(db);
  snapshotB = snapshotTenant(db, TENANT_B);
});

async function importCategoriesA() {
  const p = preview("categories", [{ name: "Bebidas", description: "" }]);
  const r = await analyze(db, "categories", p, TENANT_A);
  await runCategoriesImport({ parsedPreview: p, dbAwareResult: r, prismaClient: asClient(db), tenantId: TENANT_A, isDryRun: false });
}

async function importLinesA() {
  const p = preview("lines", [{ name: "Gaseosas", category_name: "Bebidas" }]);
  const r = await analyze(db, "lines", p, TENANT_A);
  await runLinesImport({ parsedPreview: p, dbAwareResult: r, prismaClient: asClient(db), tenantId: TENANT_A, isDryRun: false });
}

async function importSublinesA() {
  const p = preview("sublines", [{ name: "Cola", line_name: "Gaseosas", category_name: "Bebidas" }]);
  const r = await analyze(db, "sublines", p, TENANT_A);
  await runSublinesImport({ parsedPreview: p, dbAwareResult: r, prismaClient: asClient(db), tenantId: TENANT_A, isDryRun: false });
}

async function importSuppliersA() {
  const p = preview("suppliers", [{ name: "Distribuidora Uno", nit: "06140101011011" }]);
  const r = await analyze(db, "suppliers", p, TENANT_A);
  await runSuppliersImport({ parsedPreview: p, dbAwareResult: r, prismaClient: asClient(db), tenantId: TENANT_A, isDryRun: false });
}

describe("categorías", () => {
  it("mismo nombre/código existente en B NO es duplicado de A; solo escribe tenant A", async () => {
    const p = preview("categories", [{ name: "Bebidas", description: "" }]);
    const r = await analyze(db, "categories", p, TENANT_A);
    expect(r.rows[0].resolution).toBe("CREATE");
    expect(r.rows[0].existsInDb).toBe(false);

    await runCategoriesImport({ parsedPreview: p, dbAwareResult: r, prismaClient: asClient(db), tenantId: TENANT_A, isDryRun: false });

    expect(db.count("productCategory", { tenant_id: TENANT_A })).toBe(1);
    expect(db.count("productCategory", { tenant_id: TENANT_B })).toBe(1);
    expect(snapshotTenant(db, TENANT_B)).toBe(snapshotB);
  });

  it("control: para B el mismo nombre SÍ es duplicado", async () => {
    const r = await analyze(db, "categories", preview("categories", [{ name: "Bebidas" }]), TENANT_B);
    expect(r.rows[0].resolution).not.toBe("CREATE");
  });
});

describe("líneas y sublíneas", () => {
  it("línea de A no resuelve la categoría padre de B", async () => {
    const r = await analyze(db, "lines", preview("lines", [{ name: "Gaseosas", category_name: "Bebidas" }]), TENANT_A);
    expect(r.rows[0].resolution).toBe("ERROR");
    expect(foundIds(r, "category")).toEqual([]);
  });

  it("con su propia categoría, la línea de A se vincula SOLO a la categoría de A", async () => {
    await importCategoriesA();
    await importLinesA();

    const lineA = db.tables.productLine.find((l) => l.tenant_id === TENANT_A)!;
    expect(lineA).toBeDefined();
    expect(tenantOf(db, "productCategory", lineA.category_id as string)).toBe(TENANT_A);
    expect(snapshotTenant(db, TENANT_B)).toBe(snapshotB);
  });

  it("sublínea de A no resuelve la línea de B; con su línea, se vincula solo a A", async () => {
    const before = await analyze(db, "sublines", preview("sublines", [{ name: "Cola", line_name: "Gaseosas" }]), TENANT_A);
    expect(before.rows[0].resolution).toBe("ERROR");

    await importCategoriesA();
    await importLinesA();
    await importSublinesA();

    const subA = db.tables.productSubline.find((s) => s.tenant_id === TENANT_A)!;
    expect(subA).toBeDefined();
    expect(tenantOf(db, "productLine", subA.line_id as string)).toBe(TENANT_A);
    expect(snapshotTenant(db, TENANT_B)).toBe(snapshotB);
  });
});

describe("proveedores y clientes", () => {
  it("proveedor con el mismo NIT/nombre que uno de B → CREATE para A, escrito en tenant A", async () => {
    const p = preview("suppliers", [{ name: "Distribuidora Uno", nit: "06140101011011" }]);
    const r = await analyze(db, "suppliers", p, TENANT_A);
    expect(r.rows[0].resolution).toBe("CREATE");

    await runSuppliersImport({ parsedPreview: p, dbAwareResult: r, prismaClient: asClient(db), tenantId: TENANT_A, isDryRun: false });
    expect(db.count("supplier", { tenant_id: TENANT_A })).toBe(1);
    expect(snapshotTenant(db, TENANT_B)).toBe(snapshotB);
  });

  it("cliente con el mismo DUI/nombre que uno de B → CREATE para A, escrito en tenant A", async () => {
    const p = preview("customers", [{ name: "Cliente Uno", document_type: "DUI", document_number: "012345678" }]);
    const r = await analyze(db, "customers", p, TENANT_A);
    expect(r.rows[0].resolution).toBe("CREATE");

    await runCustomersImport({ parsedPreview: p, dbAwareResult: r, prismaClient: asClient(db), tenantId: TENANT_A, isDryRun: false });
    expect(db.count("customer", { tenant_id: TENANT_A })).toBe(1);
    expect(db.tables.customer.filter((c) => c.tenant_id === TENANT_A).every((c) => c.tenant_id === TENANT_A)).toBe(true);
    expect(snapshotTenant(db, TENANT_B)).toBe(snapshotB);
  });
});

describe("productos", () => {
  const productRow = {
    product_code: "P-001", name: "Cola 600ml", product_type: "PRODUCT", status: "ACTIVE",
    is_stockable: "SI", category_name: "Bebidas", line_name: "Gaseosas", subline_name: "Cola",
    unit_name: "UND", tax_rate_name: "IVA", supplier_name: "Distribuidora Uno",
  };

  it("sin catálogo propio, A NO resuelve categoría/línea/sublínea/proveedor/impuesto de B", async () => {
    const r = await analyze(db, "products", preview("products", [productRow]), TENANT_A);
    expect(r.rows[0].resolution).toBe("ERROR");
    for (const type of ["category", "line", "subline", "supplier", "tax_rate"]) {
      for (const id of foundIds(r, type)) {
        expect(db.tables[
          { category: "productCategory", line: "productLine", subline: "productSubline", supplier: "supplier", tax_rate: "taxRate" }[type]!
        ].find((row) => row.id === id)?.tenant_id).not.toBe(TENANT_B);
      }
    }
  });

  it("con catálogo propio: product_code de B no es duplicado; todas las dependencias resueltas son de A", async () => {
    await importCategoriesA();
    await importLinesA();
    await importSublinesA();
    await importSuppliersA();
    db.seed("taxRate", { tenant_id: TENANT_A, name: "IVA", rate: 13, status: "active" });

    const p = preview("products", [productRow]);
    const r = await analyze(db, "products", p, TENANT_A);
    expect(r.rows[0].errors).toEqual([]);
    expect(r.rows[0].resolution).toBe("CREATE");

    expect(tenantOf(db, "productCategory", foundIds(r, "category")[0])).toBe(TENANT_A);
    expect(tenantOf(db, "productLine", foundIds(r, "line")[0])).toBe(TENANT_A);
    expect(tenantOf(db, "productSubline", foundIds(r, "subline")[0])).toBe(TENANT_A);
    expect(tenantOf(db, "supplier", foundIds(r, "supplier")[0])).toBe(TENANT_A);
    expect(tenantOf(db, "taxRate", foundIds(r, "tax_rate")[0])).toBe(TENANT_A);

    await runProductsImport({
      parsedPreview: p, dbAwareResult: r, prismaClient: asClient(db),
      tenantId: TENANT_A, isDryRun: false, commercialCtx: LEGACY_CTX(TENANT_A),
    });

    const productA = db.tables.product.find((x) => x.tenant_id === TENANT_A)!;
    expect(productA.product_code).toBe("P-001");
    for (const [col, table] of [
      ["category_id", "productCategory"], ["line_id", "productLine"], ["subline_id", "productSubline"],
      ["supplier_id", "supplier"], ["tax_rate_id", "taxRate"],
    ] as const) {
      expect(tenantOf(db, table, productA[col] as string)).toBe(TENANT_A);
    }
    // La unidad es catálogo global compartido — una sola copia.
    expect(db.count("unitOfMeasure")).toBe(1);
    expect(snapshotTenant(db, TENANT_B)).toBe(snapshotB);
  });
});

describe("inventario inicial", () => {
  it("solo resuelve producto/sucursal de A; el INITIAL_LOAD de B no bloquea a A; escribe solo tenant A", async () => {
    const branchA  = db.seed("branch", { tenant_id: TENANT_A, name: "Sede Central", status: "active" });
    const productA = db.seed("product", {
      tenant_id: TENANT_A, product_code: "P-001", sku: null, name: "Cola 600ml",
      product_type: "PRODUCT", is_stockable: true, status: "ACTIVE",
    });

    const p = preview("inventory_initial", [{ product_code: "P-001", location_name: "Sede Central", quantity: "10", unit_cost: "0.50" }]);
    const r = await analyze(db, "inventory_initial", p, TENANT_A);
    expect(r.rows[0].errors).toEqual([]);
    expect(r.rows[0].resolution).toBe("CREATE");

    await runInventoryImport({
      parsedPreview: p, dbAwareResult: r, prismaClient: asClient(db),
      tenantId: TENANT_A, isDryRun: false, performedBy: null,
    });

    const plA = db.tables.productLocation.filter((x) => x.tenant_id === TENANT_A);
    expect(plA).toHaveLength(1);
    expect(plA[0]).toMatchObject({ product_id: productA.id, location_id: branchA.id });
    const movA = db.tables.inventoryMovement.filter((x) => x.tenant_id === TENANT_A);
    expect(movA).toHaveLength(1);
    expect(movA[0]).toMatchObject({ product_id: productA.id, location_id: branchA.id });
    expect(snapshotTenant(db, TENANT_B)).toBe(snapshotB);
  });

  it("sin producto/sucursal propios, A no puede usar los de B", async () => {
    const p = preview("inventory_initial", [{ product_code: "P-001", location_name: "Sede Central", quantity: "10" }]);
    const r = await analyze(db, "inventory_initial", p, TENANT_A);
    expect(r.rows[0].resolution).toBe("ERROR");
  });
});
