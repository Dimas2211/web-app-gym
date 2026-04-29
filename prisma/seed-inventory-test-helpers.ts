/**
 * prisma/seed-inventory-test-helpers.ts
 *
 * Lógica compartida entre seed-inventory-test.ts y seed-inventory-test-cleanup.ts.
 * USO EXCLUSIVO: base local de desarrollo — Etapa 11.
 *
 * No importar desde código de producción.
 */

import { PrismaClient } from "@prisma/client";

export type TestLocation = {
  tenantId: string;
  tenantName: string;
  locationId: string;
  locationName: string;
};

/**
 * Resuelve el tenant activo y la sucursal de prueba.
 *
 * Reglas:
 * 1. Usa el primer Gym creado en la base local (orderBy: created_at asc).
 * 2. Busca la sucursal cuyo nombre contiene "Central" (case-insensitive).
 * 3. Si no la encuentra, usa la primera sucursal disponible del tenant.
 * 4. Si no hay ninguna sucursal, termina el proceso con error claro.
 */
export async function resolveTestLocation(
  prisma: PrismaClient,
): Promise<TestLocation> {
  const gym = await prisma.gym.findFirst({
    select: { id: true, name: true },
    orderBy: { created_at: "asc" },
  });

  if (!gym) {
    console.error("✗ No se encontró ningún Gym/Tenant en la base local.");
    console.error("  Ejecuta primero: npm run db:seed");
    process.exit(1);
  }

  console.log(`  Tenant : ${gym.name} (${gym.id})`);

  // Buscar "Sucursal Central"
  const central = await prisma.branch.findFirst({
    where: {
      gym_id: gym.id,
      name: { contains: "Central", mode: "insensitive" },
    },
    select: { id: true, name: true },
  });

  if (central) {
    console.log(`  Sucursal: ${central.name} (${central.id})`);
    return {
      tenantId: gym.id,
      tenantName: gym.name,
      locationId: central.id,
      locationName: central.name,
    };
  }

  // Fallback: primera sucursal del tenant
  const fallback = await prisma.branch.findFirst({
    where: { gym_id: gym.id },
    select: { id: true, name: true },
    orderBy: { created_at: "asc" },
  });

  if (!fallback) {
    console.error("✗ No se encontró ninguna sucursal para este tenant.");
    console.error("  Ejecuta primero: npm run db:seed");
    process.exit(1);
  }

  console.warn(
    `⚠  No se encontró "Sucursal Central". Usando fallback: ${fallback.name} (${fallback.id})`,
  );

  return {
    tenantId: gym.id,
    tenantName: gym.name,
    locationId: fallback.id,
    locationName: fallback.name,
  };
}
