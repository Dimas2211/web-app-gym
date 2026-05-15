/**
 * prisma/importers/import-csv-municipalities.ts
 *
 * Lee el CSV oficial de MH El Salvador (catálogo de municipios/distritos)
 * y genera prisma/importers/generated/municipalities.data.ts
 *
 * Fuente: docs/dte-official/catalogs/catalogo-de-municipios-y-distritos.csv
 * Encoding del CSV: Latin-1 / Windows-1252
 *
 * Columnas esperadas:
 *   Código de carga agentes  →  dte_full_code (4 dígitos, ej: "0511")
 *   Código Distritos         →  district_code (6 dígitos, ej: "050611")
 *   Distritos                →  district_name (ej: "Santa Tecla antes: Nueva San Salvador")
 *   Código Municipios        →  new_municipality_code (4 dígitos, ej: "0506")
 *   Municipios               →  new_municipality_name (ej: "La Libertad Sur")
 *
 * Regla de códigos DTE:
 *   dept_code = dte_full_code.slice(0, 2)   ("05")
 *   code      = dte_full_code.slice(2, 4)   ("11")
 *
 * Uso:
 *   npx tsx prisma/importers/import-csv-municipalities.ts
 *
 * Output:
 *   prisma/importers/generated/municipalities.data.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Rutas ─────────────────────────────────────────────────────────

const CSV_PATH = path.resolve(
  __dirname,
  "../../docs/dte-official/catalogs/catalogo-de-municipios-y-distritos.csv",
);

const OUTPUT_PATH = path.resolve(
  __dirname,
  "generated/municipalities.data.ts",
);

// ── Mapa dept_code → dept_name ────────────────────────────────────

const DEPT_NAMES: Record<string, string> = {
  "01": "Ahuachapán",
  "02": "Santa Ana",
  "03": "Sonsonate",
  "04": "Chalatenango",
  "05": "La Libertad",
  "06": "San Salvador",
  "07": "Cuscatlán",
  "08": "La Paz",
  "09": "Cabañas",
  "10": "San Vicente",
  "11": "Usulután",
  "12": "San Miguel",
  "13": "Morazán",
  "14": "La Unión",
};

// ── Tipos ─────────────────────────────────────────────────────────

export interface MunicipalityRow {
  dept_code:             string;
  dept_name:             string;
  code:                  string;
  dte_full_code:         string;
  district_code:         string;
  district_name:         string;
  new_municipality_code: string;
  new_municipality_name: string;
  name:                  string;
}

// ── Parser CSV ─────────────────────────────────────────────────────

function parseCSV(filePath: string): MunicipalityRow[] {
  if (!fs.existsSync(filePath)) {
    console.error(`✗ No se encontró el CSV en:\n  ${filePath}`);
    process.exit(1);
  }

  // El CSV está en encoding Latin-1 (Windows-1252)
  const raw = fs.readFileSync(filePath, "latin1");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== "");

  if (lines.length < 2) {
    console.error("✗ El CSV está vacío o no tiene datos.");
    process.exit(1);
  }

  // Verificar encabezado (puede tener caracteres extraños por el encoding)
  const header = lines[0].split(",");
  if (header.length < 5) {
    console.error(`✗ El CSV no tiene las 5 columnas esperadas. Header: "${lines[0]}"`);
    process.exit(1);
  }

  const rows: MunicipalityRow[] = [];
  const seen = new Set<string>(); // para detectar duplicados de dte_full_code

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 5) continue;

    const dteFullCode         = cols[0].trim();
    const districtCode        = cols[1].trim();
    const districtName        = cols[2].trim();
    const newMunicipalityCode = cols[3].trim();
    const newMunicipalityName = cols[4].trim();

    // Validar que dteFullCode sea 4 dígitos
    if (!/^\d{4}$/.test(dteFullCode)) {
      console.warn(`  ⚠ Fila ${i + 1}: Código de carga agentes inválido "${dteFullCode}" — omitida.`);
      continue;
    }

    const deptCode = dteFullCode.slice(0, 2);
    const code     = dteFullCode.slice(2, 4);
    const deptName = DEPT_NAMES[deptCode];

    if (!deptName) {
      console.warn(`  ⚠ Fila ${i + 1}: dept_code "${deptCode}" no tiene nombre — omitida.`);
      continue;
    }

    if (seen.has(dteFullCode)) {
      console.warn(`  ⚠ Fila ${i + 1}: dte_full_code "${dteFullCode}" duplicado — omitida.`);
      continue;
    }
    seen.add(dteFullCode);

    // Nombre visible en UI
    const name = `${districtName} — ${newMunicipalityName}`;

    rows.push({
      dept_code:             deptCode,
      dept_name:             deptName,
      code,
      dte_full_code:         dteFullCode,
      district_code:         districtCode,
      district_name:         districtName,
      new_municipality_code: newMunicipalityCode,
      new_municipality_name: newMunicipalityName,
      name,
    });
  }

  return rows;
}

// ── Serialización ─────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function generateFile(rows: MunicipalityRow[]): string {
  const now = new Date().toISOString();

  const rowsTs = rows
    .map(
      (r) =>
        `  { dept_code: "${esc(r.dept_code)}", dept_name: "${esc(r.dept_name)}", ` +
        `code: "${esc(r.code)}", dte_full_code: "${esc(r.dte_full_code)}", ` +
        `district_code: "${esc(r.district_code)}", district_name: "${esc(r.district_name)}", ` +
        `new_municipality_code: "${esc(r.new_municipality_code)}", ` +
        `new_municipality_name: "${esc(r.new_municipality_name)}", ` +
        `name: "${esc(r.name)}" },`,
    )
    .join("\n");

  return `// AUTO-GENERATED — do not edit manually.
// Source: docs/dte-official/catalogs/catalogo-de-municipios-y-distritos.csv
// Generated: ${now}
// Run: npx tsx prisma/importers/import-csv-municipalities.ts
//
// dept_code  = dte_full_code.slice(0, 2) — código DTE de departamento
// code       = dte_full_code.slice(2, 4) — código DTE relativo al departamento
// dte_full_code = "Código de carga agentes" completo (4 dígitos)
// district_name / district_code = distrito según catálogo nuevo
// new_municipality_name / new_municipality_code = municipio agrupado nuevo
// name = text visible en UI: district_name — new_municipality_name

export interface MunicipalityRow {
  dept_code:             string;
  dept_name:             string;
  code:                  string;
  dte_full_code:         string;
  district_code:         string;
  district_name:         string;
  new_municipality_code: string;
  new_municipality_name: string;
  name:                  string;
}

// Municipios/distritos El Salvador — catálogo DTE MH (${rows.length} registros)
export const MUNICIPALITIES: MunicipalityRow[] = [
${rowsTs}
];
`;
}

// ── Main ──────────────────────────────────────────────────────────

function run(): void {
  console.log("─────────────────────────────────────────────────");
  console.log("  Importador CSV — Municipios/Distritos DTE MH");
  console.log("─────────────────────────────────────────────────");
  console.log(`  CSV:    ${CSV_PATH}`);
  console.log(`  Output: ${OUTPUT_PATH}`);
  console.log("");

  const rows = parseCSV(CSV_PATH);
  console.log(`  Registros parseados: ${rows.length}`);

  // Validaciones mínimas
  if (rows.length < 200) {
    console.warn(`  ⚠ Menos de 200 municipios (${rows.length}) — revisar CSV.`);
  }

  // Verificar casos clave
  const santaTecla = rows.find((r) => r.dte_full_code === "0511");
  const elCongo    = rows.find((r) => r.dte_full_code === "0204");
  const yamabal    = rows.find((r) => r.dte_full_code === "1325");
  const yoloaiiquin = rows.find((r) => r.dte_full_code === "1326");

  if (santaTecla) {
    console.log(`  ✅ Santa Tecla: dept=${santaTecla.dept_code}, code=${santaTecla.code}, name="${santaTecla.name}"`);
  } else {
    console.warn("  ⚠ Santa Tecla (0511) no encontrada en CSV.");
  }

  if (elCongo) {
    console.log(`  ✅ El Congo:    dept=${elCongo.dept_code}, code=${elCongo.code}, name="${elCongo.name}"`);
  } else {
    console.warn("  ⚠ El Congo (0204) no encontrado en CSV.");
  }

  if (yamabal) {
    console.log(`  ✅ Yamabal:     dept=${yamabal.dept_code}, code=${yamabal.code}, name="${yamabal.name}"`);
  } else {
    console.warn("  ⚠ Yamabal (1325) no encontrado en CSV.");
  }

  if (yoloaiiquin) {
    console.log(`  ✅ Yoloaiquín:  dept=${yoloaiiquin.dept_code}, code=${yoloaiiquin.code}, name="${yoloaiiquin.name}"`);
  } else {
    console.warn("  ⚠ Yoloaiquín (1326) no encontrado en CSV.");
  }

  const content = generateFile(rows);

  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(OUTPUT_PATH, content, "utf-8");

  console.log("");
  console.log("✓ Archivo generado correctamente.");
  console.log("─────────────────────────────────────────────────");
  console.log("");
  console.log("Siguiente paso:");
  console.log("  npm run db:seed:catalogs   ← aplica los municipios a la base");
}

run();
