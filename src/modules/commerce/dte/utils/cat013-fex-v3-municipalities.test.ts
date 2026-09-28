// ─────────────────────────────────────────────────────────────────
// commerce/dte — cat013-fex-v3-municipalities.test.ts
//
// CAT-013 Municipio (MH Catálogos v1.2, 10/2025) — constante runtime
// privada de FEX 11 v3. Verifica contenido, invariantes y paridad con la
// transcripción documental docs/dte-official/catalogs/cat-013-municipios-v1.2.csv.
// ─────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, it, expect } from "vitest";
import { CAT013_FEX_V3_MUNICIPALITIES, normalizeCat013Name } from "./cat013-fex-v3-municipalities";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..", "..");
const CSV_PATH  = join(REPO_ROOT, "docs", "dte-official", "catalogs", "cat-013-municipios-v1.2.csv");

function code(dept: string, name: string): string | undefined {
  return CAT013_FEX_V3_MUNICIPALITIES.find(
    (m) => m.departmentCode === dept && normalizeCat013Name(m.municipalityName) === normalizeCat013Name(name),
  )?.municipalityCode;
}

describe("CAT-013 FEX v3 — contenido oficial", () => {
  it("contiene exactamente 44 municipios nacionales (sin 00 = Otro)", () => {
    expect(CAT013_FEX_V3_MUNICIPALITIES).toHaveLength(44);
    expect(CAT013_FEX_V3_MUNICIPALITIES.some((m) => m.municipalityCode === "00")).toBe(false);
  });

  it.each([
    ["05", "LA LIBERTAD SUR",     "28"],
    ["06", "SAN SALVADOR CENTRO", "23"],
    ["02", "SANTA ANA ESTE",      "16"],
    ["13", "MORAZAN SUR",         "28"],
    ["13", "Morazán Sur",         "28"],
    ["09", "Cabañas Este",        "11"],
  ])("%s + %s → %s", (dept, name, expected) => {
    expect(code(dept, name)).toBe(expected);
  });

  it("un mismo código puede existir en departamentos distintos (05/28 y 13/28)", () => {
    const with28 = CAT013_FEX_V3_MUNICIPALITIES.filter((m) => m.municipalityCode === "28");
    expect(with28.map((m) => m.departmentCode).sort()).toEqual(["05", "13"]);
  });

  it("sin duplicados por departamento + nombre normalizado", () => {
    const keys = CAT013_FEX_V3_MUNICIPALITIES.map((m) => `${m.departmentCode}|${normalizeCat013Name(m.municipalityName)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("sin duplicados por departamento + código", () => {
    const keys = CAT013_FEX_V3_MUNICIPALITIES.map((m) => `${m.departmentCode}|${m.municipalityCode}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("todos los departmentCode y municipalityCode tienen exactamente 2 dígitos", () => {
    for (const m of CAT013_FEX_V3_MUNICIPALITIES) {
      expect(m.departmentCode).toMatch(/^[0-9]{2}$/);
      expect(m.municipalityCode).toMatch(/^[0-9]{2}$/);
    }
  });

  it("cubre los 14 departamentos", () => {
    expect(new Set(CAT013_FEX_V3_MUNICIPALITIES.map((m) => m.departmentCode)).size).toBe(14);
  });

  it("es inmutable", () => {
    expect(Object.isFrozen(CAT013_FEX_V3_MUNICIPALITIES)).toBe(true);
    expect(Object.isFrozen(CAT013_FEX_V3_MUNICIPALITIES[0])).toBe(true);
  });

  it("es idéntica a la transcripción documental CSV v1.2", () => {
    const lines = readFileSync(CSV_PATH, "utf8").trim().split(/\r?\n/);
    expect(lines[0]).toBe("dept_code,code,name");
    const fromCsv = lines.slice(1).map((l) => {
      const [departmentCode, municipalityCode, municipalityName] = l.split(",");
      return { departmentCode, municipalityCode, municipalityName };
    });
    expect(CAT013_FEX_V3_MUNICIPALITIES.map((m) => ({ ...m }))).toEqual(fromCsv);
  });
});

describe("CAT-013 FEX v3 — aislamiento", () => {
  // Archivos de producción (no tests) de src/ que IMPORTAN el módulo
  // `moduleName` (menciones en comentarios no cuentan).
  function productionImporters(moduleName: string, selfFile: string): string[] {
    const importRe = new RegExp(`from\\s+["'][^"']*/${moduleName}["']`);
    const srcRoot = join(REPO_ROOT, "src");
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry) || entry === selfFile) continue;
        if (importRe.test(readFileSync(full, "utf8"))) {
          found.push(relative(srcRoot, full).replace(/\\/g, "/"));
        }
      }
    };
    walk(srcRoot);
    return found.sort();
  }

  it("solo fex11-v3-territory.ts importa la constante CAT-013", () => {
    expect(productionImporters("cat013-fex-v3-municipalities", "cat013-fex-v3-municipalities.ts"))
      .toEqual(["modules/commerce/dte/utils/fex11-v3-territory.ts"]);
  });

  it("solo el builder FEX 11 v3 importa projectFexV3Territory (fex11-v3-territory)", () => {
    expect(productionImporters("fex11-v3-territory", "fex11-v3-territory.ts"))
      .toEqual(["modules/commerce/dte/services/generate-fex-json.service.ts"]);
  });
});
