/**
 * seed.commerce-catalogs.ts
 *
 * Catálogos globales del dominio commerce — sin tenant_id.
 * Fuentes: CAT-013+CAT-012, CAT-019, CAT-020, CAT-022 del Sistema de
 * Transmisión del Ministerio de Hacienda de El Salvador.
 *
 * Los datos de EconomicActivity, Municipality y Country provienen del
 * archivo generado por prisma/importers/import-excel-catalogs.ts.
 * Para regenerarlos: npx tsx prisma/importers/import-excel-catalogs.ts
 *
 * Idempotente: puede ejecutarse múltiples veces sin duplicar datos.
 */

import { PrismaClient } from "@prisma/client";
import {
  ECONOMIC_ACTIVITIES,
  MUNICIPALITIES,
  COUNTRIES,
} from "../importers/generated/commerce-catalogs.data";

// ════════════════════════════════════════════════════════════════
// CAT-022 — Tipos de identificación del contribuyente
// ════════════════════════════════════════════════════════════════

const IDENTIFICATION_TYPES = [
  { code: "00", name: "Consumidor final",       description: "Sin número de documento tributario" },
  { code: "13", name: "DUI",                    description: "Documento Único de Identidad" },
  { code: "02", name: "Carnet de residente",    description: "Carnet de residente emitido por DGME" },
  { code: "03", name: "Pasaporte",              description: "Pasaporte vigente" },
  { code: "37", name: "Otro",                   description: "Otro tipo de documento de identidad" },
];

export async function seedCommerceCatalogs(prisma: PrismaClient): Promise<void> {
  console.log("\n🏪 Catálogos commerce (identificación, actividades, municipios, países)...");

  // ── IdentificationType ───────────────────────────────────────
  console.log("\n  📄 Tipos de identificación (CAT-022)...");
  for (const item of IDENTIFICATION_TYPES) {
    await prisma.identificationType.upsert({
      where:  { code: item.code },
      update: { name: item.name, description: item.description },
      create: { ...item, status: "active" },
    });
    console.log(`    ✅ ${item.code} — ${item.name}`);
  }

  // ── EconomicActivity ─────────────────────────────────────────
  console.log("\n  📊 Actividades económicas (CAT-019)...");
  let actCreated = 0;
  for (const item of ECONOMIC_ACTIVITIES) {
    await prisma.economicActivity.upsert({
      where:  { code: item.code },
      update: { name: item.name, section: item.section },
      create: { ...item, status: "active" },
    });
    actCreated++;
  }
  console.log(`    ✅ ${actCreated} actividades cargadas`);

  // ── Municipality ─────────────────────────────────────────────
  console.log("\n  🗺️  Municipios (CAT-013)...");
  let munCreated = 0;
  for (const item of MUNICIPALITIES) {
    await prisma.municipality.upsert({
      where:  { dept_code_code: { dept_code: item.dept_code, code: item.code } },
      update: { name: item.name, dept_name: item.dept_name },
      create: { ...item, status: "active" },
    });
    munCreated++;
  }
  const deptCount = new Set(MUNICIPALITIES.map(m => m.dept_code)).size;
  console.log(`    ✅ ${munCreated} municipios cargados (${deptCount} departamentos)`);

  // ── Country ──────────────────────────────────────────────────
  console.log("\n  🌎 Países...");
  let cntCreated = 0;
  for (const item of COUNTRIES) {
    await prisma.country.upsert({
      where:  { code: item.code },
      update: { name: item.name },
      create: { ...item, status: "active" },
    });
    cntCreated++;
  }
  console.log(`    ✅ ${cntCreated} países cargados`);
}
