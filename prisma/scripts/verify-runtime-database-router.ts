/**
 * verify-runtime-database-router.ts
 *
 * Validación READ-ONLY del Runtime Database Router (PASO 2 — Plataforma
 * Multiindustria). No escribe nada, no firma DTE, no transmite, no toca
 * MariaDB externa. Solo demuestra que el router:
 *
 *   1. Resuelve la organización "GYM EL SALVADOR" en el control plane.
 *   2. Lee su tenant_id.
 *   3. Resuelve el perfil activo (GymSystem Supabase Producción).
 *   4. Abre un PrismaClient runtime contra esa base cliente.
 *   5. Lee datos mínimos (tenant/location/admin/conteos) usando ese
 *      PrismaClient runtime — nunca el Prisma de control plane.
 *
 * No imprime secrets, DATABASE_URL, DIRECT_URL ni PLATFORM_ENCRYPTION_KEY.
 *
 * USO (PowerShell) — con DATABASE_URL / DIRECT_URL de la app (control
 * plane) ya exportadas en la sesión:
 *
 *   npx tsx prisma/scripts/verify-runtime-database-router.ts
 *
 * Opcional: pasar el nombre/código de la organización a resolver:
 *
 *   npx tsx prisma/scripts/verify-runtime-database-router.ts "GYM EL SALVADOR"
 */

import "dotenv/config";
import { controlPlanePrisma } from "../../src/modules/platform/runtime/control-plane-prisma";
import {
  resolveRuntimeDatabaseProfileForOrganization,
  withRuntimePrisma,
  RuntimeDatabaseRouterError,
} from "../../src/modules/platform/runtime/runtime-database-router";

const ORG_QUERY = process.argv[2] ?? "GYM EL SALVADOR";

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Verify — Runtime Database Router (PASO 2)                     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  // 1) Resolver organización en CONTROL PLANE (por nombre o código exacto)
  const organization = await controlPlanePrisma.platformOrganization.findFirst({
    where: {
      OR: [{ name: ORG_QUERY }, { code: ORG_QUERY }],
    },
    select: { id: true, name: true, code: true, tenant_id: true },
  });

  if (!organization) {
    console.error(`✗ Organización no encontrada con nombre/código: "${ORG_QUERY}"`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n[control plane] Organización: ${organization.name} (${organization.code})`);
  console.log(`[control plane] tenant_id: ${organization.tenant_id ? "asignado" : "NO asignado"}`);

  if (!organization.tenant_id) {
    console.error("✗ La organización no tiene tenant_id — Tenant Binding pendiente.");
    process.exitCode = 1;
    return;
  }

  // 2) Resolver perfil runtime activo (control plane, sin abrir conexión aún)
  const profile = await resolveRuntimeDatabaseProfileForOrganization(organization.id);
  console.log(`[control plane] Perfil runtime resuelto: "${profile.label}" (${profile.environment}, ${profile.provider})`);
  console.log(`[control plane] profileId: ${profile.id}`);

  // 3) Abrir PrismaClient runtime y leer datos mínimos — READ-ONLY
  let usedRuntimeClient = false;

  await withRuntimePrisma({ organizationId: organization.id }, async (client) => {
    usedRuntimeClient = true;

    const gym = await client.gym.findFirst({
      select: { id: true, name: true, slug: true, status: true },
      orderBy: { created_at: "asc" },
    });

    const location = await client.branch.findFirst({
      select: { id: true, name: true, status: true },
      orderBy: { name: "asc" },
    });

    const admin = await client.user.findFirst({
      where:  { role: { in: ["super_admin", "branch_admin"] as never[] } },
      select: { id: true, email: true, role: true },
      orderBy: { created_at: "asc" },
    });

    const [productCount, customerCount, saleCount] = await Promise.all([
      client.product.count().catch(() => -1),
      client.customer.count().catch(() => -1),
      client.sale.count().catch(() => -1),
    ]);

    console.log("\n[client runtime] Conectado correctamente vía Runtime Database Router.");
    console.log(`[client runtime] tenant (gym) activo: ${gym ? `${gym.name} [${gym.status}]` : "ninguno"}`);
    console.log(`[client runtime] location activa:     ${location ? `${location.name} [${location.status}]` : "ninguna"}`);
    console.log(`[client runtime] admin detectado:      ${admin ? `${admin.email} (${admin.role})` : "ninguno"}`);
    console.log(`[client runtime] conteo products:      ${productCount}`);
    console.log(`[client runtime] conteo customers:     ${customerCount}`);
    console.log(`[client runtime] conteo sales:         ${saleCount}`);
  });

  console.log(`\n[check] Lecturas realizadas con runtimePrisma (no controlPlanePrisma): ${usedRuntimeClient ? "✓" : "✗"}`);
  console.log("\n✅ Runtime Database Router validado en modo READ-ONLY. No se escribió ningún dato.");
}

main()
  .catch((err) => {
    if (err instanceof RuntimeDatabaseRouterError) {
      console.error(`\n✗ [${err.code}] ${err.message}`);
    } else {
      console.error("\n✗ Error inesperado:", err instanceof Error ? err.message : err);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await controlPlanePrisma.$disconnect();
  });
