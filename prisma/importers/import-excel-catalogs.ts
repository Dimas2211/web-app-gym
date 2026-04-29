/**
 * prisma/importers/import-excel-catalogs.ts
 *
 * Lee el Excel oficial del MH El Salvador y genera el archivo de datos
 * TypeScript que consume seed.commerce-catalogs.ts.
 *
 * Catálogos extraídos:
 *   CAT-019 → EconomicActivity (774 registros)
 *   CAT-012 + CAT-013 → Municipality (43 zonas con dept embebido)
 *   CAT-020 → Country (249 países ISO 3166-1)
 *
 * Uso:
 *   npx ts-node --project tsconfig.json prisma/importers/import-excel-catalogs.ts
 *
 * Output:
 *   prisma/importers/generated/commerce-catalogs.data.ts
 */

import { createRequire } from "module";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const require    = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX       = require("xlsx") as typeof import("xlsx");
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Rutas ─────────────────────────────────────────────────────────

const EXCEL_PATH = path.resolve(
  __dirname,
  "../../database/catalogs/Catálogos del Sistema de Transmisión V 1.2.xlsx",
);

const OUTPUT_PATH = path.resolve(
  __dirname,
  "generated/commerce-catalogs.data.ts",
);

// ── Tipos de salida ───────────────────────────────────────────────

interface ActivityRow   { code: string; name: string; section: string }
interface MunicipalityRow { dept_code: string; dept_name: string; code: string; name: string }
interface CountryRow    { code: string; name: string }

// ── Mapa de prefijos de municipio → departamento ──────────────────
// Orden importa: prefijos más largos primero para evitar matches parciales.

const DEPT_PREFIX_MAP: Array<{ prefix: string; code: string; name: string }> = [
  { prefix: "CHALATENANGO", code: "04", name: "Chalatenango" },
  { prefix: "LA LIBERTAD",  code: "05", name: "La Libertad"  },
  { prefix: "SAN SALVADOR", code: "06", name: "San Salvador" },
  { prefix: "SAN VICENTE",  code: "10", name: "San Vicente"  },
  { prefix: "SAN MIGUEL",   code: "12", name: "San Miguel"   },
  { prefix: "AHUACHAPAN",   code: "01", name: "Ahuachapán"   },
  { prefix: "SANTA ANA",    code: "02", name: "Santa Ana"    },
  { prefix: "SONSONATE",    code: "03", name: "Sonsonate"    },
  { prefix: "CUSCATLAN",    code: "07", name: "Cuscatlán"    },
  { prefix: "LA PAZ",       code: "08", name: "La Paz"       },
  { prefix: "CABAÑAS",      code: "09", name: "Cabañas"      },
  { prefix: "USULUTAN",     code: "11", name: "Usulután"     },
  { prefix: "MORAZAN",      code: "13", name: "Morazán"      },
  { prefix: "LA UNION",     code: "14", name: "La Unión"     },
];

function resolveDept(municipioName: string): { code: string; name: string } | null {
  const upper = municipioName.toUpperCase();
  for (const entry of DEPT_PREFIX_MAP) {
    if (upper.startsWith(entry.prefix)) {
      return { code: entry.code, name: entry.name };
    }
  }
  return null;
}

// ── Parser CAT-019 ────────────────────────────────────────────────

function parseCat019(rows: (string | number | null)[][]): ActivityRow[] {
  // Header at row 280, data from row 282 onward, ends at row before CAT-020 (row 1168)
  const START = 282;
  const END   = 1168;

  const result: ActivityRow[] = [];
  let currentSection = "";

  for (let i = START; i < END; i++) {
    const [rawCode, rawName] = rows[i] ?? [];

    if (rawCode === null || rawCode === undefined) {
      // Section/subsection header — update running section label
      if (rawName) currentSection = String(rawName).trim();
      continue;
    }

    const code = String(rawCode).trim();
    const name = rawName ? String(rawName).trim() : "";

    if (!code || !name) continue;

    result.push({ code, name, section: currentSection });
  }

  return result;
}

// ── Parser CAT-012 + CAT-013 ──────────────────────────────────────

function parseMunicipalities(rows: (string | number | null)[][]): MunicipalityRow[] {
  // CAT-013 data: rows 102–144 (row 102 is "00" / Otro, 103–144 are real zones)
  const START = 102;
  const END   = 145;

  const result: MunicipalityRow[] = [];

  for (let i = START; i < END; i++) {
    const [rawCode, rawName] = rows[i] ?? [];
    if (rawCode === null || rawCode === undefined) break;

    const code = String(rawCode).trim();
    const name = rawName ? String(rawName).trim() : "";
    if (!code || !name) continue;

    // Special case: "00" = foreigners placeholder
    if (code === "00") {
      result.push({ dept_code: "00", dept_name: "Otro", code: "00", name });
      continue;
    }

    const dept = resolveDept(name);
    if (!dept) {
      console.warn(`  ⚠  No se pudo determinar departamento para municipio: "${name}" (código ${code})`);
      continue;
    }

    result.push({ dept_code: dept.code, dept_name: dept.name, code, name });
  }

  return result;
}

// ── Parser CAT-020 ────────────────────────────────────────────────

function parseCat020(rows: (string | number | null)[][]): CountryRow[] {
  // Header at row 1168, data from row 1170 onward to end of sheet
  const START = 1170;
  const result: CountryRow[] = [];

  for (let i = START; i < rows.length; i++) {
    const [rawCode, rawName] = rows[i] ?? [];
    if (rawCode === null || rawCode === undefined) break;

    const code = String(rawCode).trim();
    const name = rawName ? String(rawName).trim() : "";
    if (!code || !name) continue;

    result.push({ code, name });
  }

  return result;
}

// ── Serialización ─────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function generateFile(
  activities: ActivityRow[],
  municipalities: MunicipalityRow[],
  countries: CountryRow[],
): string {
  const now = new Date().toISOString();

  const activitiesTs = activities
    .map((a) => `  { code: "${esc(a.code)}", name: "${esc(a.name)}", section: "${esc(a.section)}" },`)
    .join("\n");

  const municipalitiesTs = municipalities
    .map((m) => `  { dept_code: "${esc(m.dept_code)}", dept_name: "${esc(m.dept_name)}", code: "${esc(m.code)}", name: "${esc(m.name)}" },`)
    .join("\n");

  const countriesTs = countries
    .map((c) => `  { code: "${esc(c.code)}", name: "${esc(c.name)}" },`)
    .join("\n");

  return `// AUTO-GENERATED — do not edit manually.
// Source: database/catalogs/Catálogos del Sistema de Transmisión V 1.2.xlsx
// Generated: ${now}
// Run: npx ts-node --project tsconfig.json prisma/importers/import-excel-catalogs.ts

export interface ActivityRow     { code: string; name: string; section: string }
export interface MunicipalityRow { dept_code: string; dept_name: string; code: string; name: string }
export interface CountryRow      { code: string; name: string }

// CAT-019 — Actividades económicas (${activities.length} registros)
export const ECONOMIC_ACTIVITIES: ActivityRow[] = [
${activitiesTs}
];

// CAT-013 + CAT-012 — Municipios con departamento embebido (${municipalities.length} registros)
export const MUNICIPALITIES: MunicipalityRow[] = [
${municipalitiesTs}
];

// CAT-020 — Países ISO 3166-1 alpha-2 (${countries.length} registros)
export const COUNTRIES: CountryRow[] = [
${countriesTs}
];
`;
}

// ── Main ──────────────────────────────────────────────────────────

function run(): void {
  console.log("─────────────────────────────────────────────────");
  console.log("  Generador de catálogos globales — commerce");
  console.log("─────────────────────────────────────────────────");
  console.log(`  Excel:  ${EXCEL_PATH}`);
  console.log(`  Output: ${OUTPUT_PATH}`);
  console.log("");

  if (!fs.existsSync(EXCEL_PATH)) {
    console.error(`✗ No se encontró el archivo Excel en:\n  ${EXCEL_PATH}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets["Hoja1"];
  if (!ws) {
    console.error("✗ El Excel no tiene una hoja llamada 'Hoja1'.");
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
    header: 1,
    defval: null,
  });

  console.log("Parseando catálogos…");

  const activities     = parseCat019(rows);
  const municipalities = parseMunicipalities(rows);
  const countries      = parseCat020(rows);

  console.log(`  CAT-019 actividades:  ${activities.length}`);
  console.log(`  CAT-013 municipios:   ${municipalities.length}`);
  console.log(`  CAT-020 países:       ${countries.length}`);
  console.log("");

  // Validaciones mínimas
  if (activities.length < 700) {
    console.warn(`  ⚠  Actividades (${activities.length}) por debajo de 700 — revisar parseo.`);
  }
  if (municipalities.length < 40) {
    console.warn(`  ⚠  Municipios (${municipalities.length}) por debajo de 40 — revisar parseo.`);
  }
  if (countries.length < 200) {
    console.warn(`  ⚠  Países (${countries.length}) por debajo de 200 — revisar parseo.`);
  }

  const content = generateFile(activities, municipalities, countries);

  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(OUTPUT_PATH, content, "utf-8");

  console.log("✓ Archivo generado correctamente.");
  console.log("─────────────────────────────────────────────────");
  console.log("");
  console.log("Siguiente paso:");
  console.log("  npm run db:seed:catalogs   ← aplica los datos a la base");
}

run();
