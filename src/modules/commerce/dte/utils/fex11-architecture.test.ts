// ─────────────────────────────────────────────────────────────────
// commerce/dte — fex11-architecture.test.ts
//
// FEX11-FINAL-CLOSURE — FEX 11 es un tipo DTE normal de fiscal.dte.
// Guardas arquitectónicas y de catálogo (sin red, sin DB):
//   - runtime sin DTE_FEX11_* ni capability fiscal.dte.export;
//   - navegación "Exportaciones" gobernada por fiscal.dte;
//   - catálogos FEX con una única fuente canónica cada uno.
// ─────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, it, expect } from "vitest";
import { MODULE_GROUPS } from "@/lib/navigation/dashboard-nav";
import { PLATFORM_MODULE_CODES } from "@/modules/platform/constants/platform-modules.constants";
import { MODULES } from "../../../../../prisma/seeds/seed.platform";
import { CAT014_UNITS, CAT014_SERVICE_DEFAULT_MH_CODE } from "../../../../../prisma/seeds/data/cat014-units";
import { FEX11_CATALOG_ROWS } from "../../../../../prisma/seeds/data/fex11-catalog-rows";
import { validateExportSaleBusinessRules } from "../../sales/export/utils/fex-validation";
import type { CreateExportSaleInput } from "../../sales/export/schemas/export-sale.schemas";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..", "..");

// Runtime = todo lo que se despliega o provisiona: src/, prisma/seeds,
// prisma/scripts. Se excluyen tests (que sí mencionan los flags para
// probar que ya no influyen).
const RUNTIME_DIRS = ["src", join("prisma", "seeds"), join("prisma", "scripts")];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const RUNTIME_FILES = RUNTIME_DIRS.flatMap((d) => listSourceFiles(join(REPO_ROOT, d)));

function filesContaining(needle: string): string[] {
  return RUNTIME_FILES
    .filter((f) => readFileSync(f, "utf-8").includes(needle))
    .map((f) => relative(REPO_ROOT, f));
}

describe("FEX 11 — runtime sin gates artificiales", () => {
  it("escanea un conjunto no vacío de fuentes runtime", () => {
    expect(RUNTIME_FILES.length).toBeGreaterThan(100);
  });

  it.each([
    "fiscal.dte.export",
    "DTE_FEX11_TEST_ENABLED",
    "DTE_FEX11_ENABLED",
    "DTE_FEX11_PRODUCTION_ENABLED",
  ])("runtime no referencia %s", (needle) => {
    expect(filesContaining(needle)).toEqual([]);
  });

  it(".env.example no declara DTE_FEX11_* ni capability de exportación", () => {
    const env = readFileSync(join(REPO_ROOT, ".env.example"), "utf-8");
    expect(env).not.toMatch(/^\s*DTE_FEX11_\w+\s*=/m);
    expect(env).not.toContain("fiscal.dte.export");
  });

  it("no existe capability de exportación en constantes ni en el catálogo de módulos", () => {
    expect(Object.values(PLATFORM_MODULE_CODES)).not.toContain("fiscal.dte.export");
    expect(MODULES.map((m) => m.code)).not.toContain("fiscal.dte.export");
    expect(MODULES.map((m) => m.code)).toContain("fiscal.dte");
  });

  it("navegación: Exportaciones depende de fiscal.dte", () => {
    const item = MODULE_GROUPS.flatMap((g) => g.items).find((i) => i.href === "/dashboard/sales/export");
    expect(item).toBeDefined();
    expect(item?.moduleCode).toBe("fiscal.dte");
  });
});

// ── Catálogos ─────────────────────────────────────────────────────

function rows(code: string) {
  return FEX11_CATALOG_ROWS.filter((r) => r.catalog_code === code);
}

describe("CAT-014 — fuente canónica única (CAT014_UNITS → units_of_measure)", () => {
  it("solo prisma/seeds/data/cat014-units.ts define CAT014_UNITS", () => {
    expect(filesContaining("export const CAT014_UNITS")).toEqual([join("prisma", "seeds", "data", "cat014-units.ts")]);
  });

  it("CAT-014 no se duplica en dte_catalog_items", () => {
    expect(rows("CAT-014")).toEqual([]);
  });

  it("40 códigos, sin duplicados de código ni de símbolo", () => {
    expect(CAT014_UNITS).toHaveLength(40);
    expect(new Set(CAT014_UNITS.map((u) => u.mh_code)).size).toBe(40);
    expect(new Set(CAT014_UNITS.map((u) => u.symbol.toLowerCase())).size).toBe(40);
  });

  it.each([
    ["Kilogramo", "kg", 34],
    ["Libra", "lb", 36],
    ["Unidad", "und", 59],
    ["Otra", "otra", 99],
  ])("%s canónico = %s / %i", (name, symbol, code) => {
    expect(CAT014_UNITS.find((u) => u.name === name)).toEqual({ mh_code: code, name, symbol });
  });

  it("no existe unidad 'Servicio' en CAT-014; el default de servicios es 59 (Unidad) solo como recomendación", () => {
    expect(CAT014_UNITS.some((u) => /servicio/i.test(u.name))).toBe(false);
    expect(CAT014_SERVICE_DEFAULT_MH_CODE).toBe(59);
  });

  it("producto con unidad sin mh_unit_code → FEX bloquea antes de generar", () => {
    const input = {
      sale_date: "2026-09-30", customer_id: "c-1", condition_operation_code: "1",
      payment_method_code: "01", payment_term_code: null, payment_term_value: null, notes: null,
      items: [{ product_id: "p-1", quantity: 1, unit_price: 10, discount_amount: 0 }],
      item_type_export: 2, fiscal_precinct_code: null, regime_code: null,
      incoterm_code: null, incoterm_desc: null, insurance_amount: 0, freight_amount: 0,
    } as CreateExportSaleInput;
    const errors = validateExportSaleBusinessRules(input, [
      { id: "p-1", name: "Consultoría", product_code: "SRV-1", product_type: "SERVICE", mh_unit_code: null },
    ], { fiscalPrecincts: [], regimes: [], incoterms: [] });
    expect(errors.some((e) => e.includes("CAT-014"))).toBe(true);
  });
});

describe("CAT-022 — tipo de identificación del receptor (códigos oficiales)", () => {
  const OFFICIAL = ["02", "03", "13", "36", "37"];

  it.each([
    join("prisma", "seeds", "seed.dte-catalog-items.ts"),
    join("src", "modules", "platform", "lib", "seed-runners", "dte-catalog-items-runner.ts"),
  ])("%s siembra exactamente los códigos oficiales", (file) => {
    const src = readFileSync(join(REPO_ROOT, file), "utf-8");
    const codes = [...src.matchAll(/catalog_code: "CAT-022", item_code: "(\d+)"/g)].map((m) => m[1]);
    expect(codes.sort()).toEqual(OFFICIAL);
  });

  it("el builder FEX acepta exactamente los códigos oficiales", () => {
    const src = readFileSync(join(REPO_ROOT, "src", "modules", "commerce", "dte", "services", "generate-fex-json.service.ts"), "utf-8");
    const m = src.match(/VALID_RECEPTOR_ID_TYPES = new Set\(\[([^\]]+)\]\)/);
    expect(m).not.toBeNull();
    expect([...m![1].matchAll(/"(\d+)"/g)].map((x) => x[1]).sort()).toEqual(OFFICIAL);
  });
});

describe("CAT-020 — fuente canónica Country, no dte_catalog_items", () => {
  it("FEX no carga CAT-020 como filas de dte_catalog_items", () => {
    expect(rows("CAT-020")).toEqual([]);
  });
});

describe("CAT-015 / CAT-027..031 — filas FEX (Excel oficial v1.2)", () => {
  it("C3 (IVA exportaciones 0%) disponible", () => {
    expect(rows("CAT-015").map((r) => r.item_code)).toContain("C3");
  });

  it.each([
    ["CAT-027", 46],
    ["CAT-028", 56],
    ["CAT-029", 2],
    ["CAT-030", 6],
    ["CAT-031", 11],
  ])("%s tiene %i ítems únicos", (code, count) => {
    const r = rows(code);
    expect(r).toHaveLength(count);
    expect(new Set(r.map((x) => x.item_code)).size).toBe(count);
  });

  it("CAT-029: 1 = Persona Natural, 2 = Persona Jurídica", () => {
    const r = rows("CAT-029");
    expect(r.find((x) => x.item_code === "1")?.item_label).toMatch(/natural/i);
    expect(r.find((x) => x.item_code === "2")?.item_label).toMatch(/jur[ií]dica/i);
  });
});
