/**
 * seed.dte-local-test-data.ts
 *
 * Crea datos mínimos de prueba para DTE en el entorno local de desarrollo.
 *
 * Propósito:
 *   Permite usar el flujo "Generar DTE" → "Generar JSON FE" en /dashboard/sales
 *   sin necesidad de configurar credenciales fiscales reales.
 *
 * Qué crea:
 *   - DteIssuerConfig (ambiente TEST) para el primer tenant + primera location activa.
 *   - DteCorrelative para FE 01 + CCFE 03 en TEST, año corriente.
 *
 * Idempotente: puede ejecutarse múltiples veces sin duplicar datos.
 *   - DteIssuerConfig: usa el unique (tenant_id, location_id, environment).
 *   - DteCorrelative:  usa el unique (tenant_id, location_id, environment, dte_type_code, year).
 *
 * ⚠️  SOLO PARA DESARROLLO LOCAL.
 *     NO usar en producción ni en el entorno de pruebas con Hacienda.
 *     Los datos fiscales aquí son ficticios y solo sirven para verificar el flujo técnico.
 *
 * Comando:
 *   npx tsx prisma/seeds/seed.dte-local-test-data.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Datos de prueba — NO usar en producción ───────────────────────

const TEST_ISSUER = {
  nit:                     "0614-000000-000-0",   // NIT ficticio para TEST
  nrc:                     "000000-0",            // NRC ficticio
  name:                    "Emisor de Prueba GYM",
  legal_name:              "GYM Test S.A. de C.V.",
  activity_code:           "93120",               // Actividades de clubes deportivos
  activity_name:           "Actividades de clubes deportivos y gimnasios",
  establishment_type_code: "02",                  // CAT-009: Sucursal
  establishment_code:      "0001",               // Debe coincidir con el bloque de numeroControl
  point_of_sale_code:      "0001",               // Debe coincidir con el bloque de numeroControl
  dept_code:               "06",                 // San Salvador (departamento)
  municipality_code:       "14",                 // San Salvador (ciudad) — válido para dept 06: rango 01-19
  address_complement:      "Colonia Escalón, 1a Calle Pte. Local prueba",
  phone:                   "2222-0000",
  email:                   "dte-pruebas@gymtest.local",
  is_active:               true,
} as const;

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log("\n🔧  DTE Local Test Data — inicio\n");

  // ── 1. Encontrar tenant (gym) activo ───────────────────────────────
  const gym = await prisma.gym.findFirst({
    where:   { status: "active" },
    orderBy: { created_at: "asc" },
    select:  { id: true, name: true, slug: true },
  });

  if (!gym) {
    console.error("❌ No se encontró ningún Gym activo.");
    console.error("   Ejecuta primero: npm run db:seed:base  (o :demo)");
    process.exit(1);
  }

  const tenant_id = gym.id;
  console.log(`  🏢 Tenant encontrado: "${gym.name}" (id: ${tenant_id})`);

  // ── 2. Encontrar location activa ───────────────────────────────────
  //    Preferencia: buscar por nombre "Sucursal Central", si no existe
  //    tomar la primera branch activa del gym.
  const preferredBranch = await prisma.branch.findFirst({
    where:   { gym_id: tenant_id, status: "active", name: { contains: "Central" } },
    orderBy: { created_at: "asc" },
    select:  { id: true, name: true },
  });

  const branch = preferredBranch ?? await prisma.branch.findFirst({
    where:   { gym_id: tenant_id, status: "active" },
    orderBy: { created_at: "asc" },
    select:  { id: true, name: true },
  });

  if (!branch) {
    console.error("❌ No se encontró ninguna Branch activa para el gym.");
    console.error("   Ejecuta primero: npm run db:seed:base  (o :demo)");
    process.exit(1);
  }

  const location_id = branch.id;
  console.log(`  📍 Location encontrada: "${branch.name}" (id: ${location_id})`);

  const year = new Date().getFullYear();
  console.log(`  📅 Año activo: ${year}`);

  // ── 3. DteIssuerConfig — upsert idempotente ────────────────────────
  //
  // El unique es (tenant_id, location_id, environment).
  // Si ya existe, se actualiza para asegurar que los campos de prueba son correctos.

  const issuerConfig = await prisma.dteIssuerConfig.upsert({
    where: {
      tenant_id_location_id_environment: {
        tenant_id,
        location_id,
        environment: "TEST",
      },
    },
    update: {
      // Actualizar para que los datos de prueba estén siempre frescos
      nit:                     TEST_ISSUER.nit,
      nrc:                     TEST_ISSUER.nrc,
      name:                    TEST_ISSUER.name,
      legal_name:              TEST_ISSUER.legal_name,
      activity_code:           TEST_ISSUER.activity_code,
      activity_name:           TEST_ISSUER.activity_name,
      establishment_type_code: TEST_ISSUER.establishment_type_code,
      establishment_code:      TEST_ISSUER.establishment_code,
      point_of_sale_code:      TEST_ISSUER.point_of_sale_code,
      dept_code:               TEST_ISSUER.dept_code,
      municipality_code:       TEST_ISSUER.municipality_code,
      address_complement:      TEST_ISSUER.address_complement,
      phone:                   TEST_ISSUER.phone,
      email:                   TEST_ISSUER.email,
      is_active:               true,
    },
    create: {
      tenant_id,
      location_id,
      environment:             "TEST",
      nit:                     TEST_ISSUER.nit,
      nrc:                     TEST_ISSUER.nrc,
      name:                    TEST_ISSUER.name,
      legal_name:              TEST_ISSUER.legal_name,
      activity_code:           TEST_ISSUER.activity_code,
      activity_name:           TEST_ISSUER.activity_name,
      establishment_type_code: TEST_ISSUER.establishment_type_code,
      establishment_code:      TEST_ISSUER.establishment_code,
      point_of_sale_code:      TEST_ISSUER.point_of_sale_code,
      dept_code:               TEST_ISSUER.dept_code,
      municipality_code:       TEST_ISSUER.municipality_code,
      address_complement:      TEST_ISSUER.address_complement,
      phone:                   TEST_ISSUER.phone,
      email:                   TEST_ISSUER.email,
      is_active:               true,
    },
    select: { id: true, nit: true, establishment_code: true, point_of_sale_code: true },
  });

  console.log(`\n  ✅ DteIssuerConfig (TEST) upserted:`);
  console.log(`     id:                  ${issuerConfig.id}`);
  console.log(`     nit:                 ${issuerConfig.nit}`);
  console.log(`     establishment_code:  ${issuerConfig.establishment_code}`);
  console.log(`     point_of_sale_code:  ${issuerConfig.point_of_sale_code}`);

  // ── 4. DteCorrelative — upsert idempotente para FE 01 ─────────────
  //
  // NO se toca last_sequence si ya existe — el seed no debe resetear el contador
  // de documentos ya emitidos. Si se necesita reiniciar manualmente la secuencia,
  // hacerlo desde pgAdmin de forma explícita.

  const corrFE = await prisma.dteCorrelative.upsert({
    where: {
      tenant_id_location_id_environment_dte_type_code_year: {
        tenant_id,
        location_id,
        environment:   "TEST",
        dte_type_code: "01",
        year,
      },
    },
    update: {}, // No tocar last_sequence — no resetear contador si ya existe
    create: {
      tenant_id,
      location_id,
      environment:   "TEST",
      dte_type_code: "01",
      year,
      last_sequence: 0,
    },
    select: { id: true, dte_type_code: true, year: true, last_sequence: true },
  });

  console.log(`\n  ✅ DteCorrelative FE 01 (TEST, ${year}) upserted:`);
  console.log(`     id:             ${corrFE.id}`);
  console.log(`     dte_type_code:  ${corrFE.dte_type_code}`);
  console.log(`     last_sequence:  ${corrFE.last_sequence}`);

  // ── 5. DteCorrelative — upsert para CCFE 03 ───────────────────────

  const corrCCFE = await prisma.dteCorrelative.upsert({
    where: {
      tenant_id_location_id_environment_dte_type_code_year: {
        tenant_id,
        location_id,
        environment:   "TEST",
        dte_type_code: "03",
        year,
      },
    },
    update: {}, // No resetear si ya existe
    create: {
      tenant_id,
      location_id,
      environment:   "TEST",
      dte_type_code: "03",
      year,
      last_sequence: 0,
    },
    select: { id: true, dte_type_code: true, year: true, last_sequence: true },
  });

  console.log(`\n  ✅ DteCorrelative CCFE 03 (TEST, ${year}) upserted:`);
  console.log(`     id:             ${corrCCFE.id}`);
  console.log(`     dte_type_code:  ${corrCCFE.dte_type_code}`);
  console.log(`     last_sequence:  ${corrCCFE.last_sequence}`);

  // ── Resumen ────────────────────────────────────────────────────────

  console.log("\n──────────────────────────────────────────────────────────────");
  console.log("✅  Datos DTE locales de prueba listos.");
  console.log(`    Tenant:      ${gym.name} (${tenant_id})`);
  console.log(`    Location:    ${branch.name} (${location_id})`);
  console.log(`    Ambiente:    TEST`);
  console.log(`    Año:         ${year}`);
  console.log("");
  console.log("   Próximo paso:");
  console.log("   1. Entrar a /dashboard/sales");
  console.log("   2. Seleccionar venta CONFIRMED + inventario aplicado");
  console.log('   3. Presionar "Generar DTE" (crea PENDING_GENERATION)');
  console.log('   4. Presionar "Generar JSON FE" (genera JSON y pasa a GENERATED)');
  console.log("──────────────────────────────────────────────────────────────\n");
}

main()
  .catch((e) => {
    console.error("\n❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
