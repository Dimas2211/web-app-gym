/**
 * prisma/scripts/fix-dh-apps-municipality.ts
 *
 * Corrige la dirección fiscal del cliente DH APPS.
 *
 * Problema: tiene municipality_code = "28" (código viejo "LA LIBERTAD SUR")
 * Corrección: debe ser municipality_code = "11" (Santa Tecla, dte_full_code = "0511")
 *
 * Verificar en UI antes de ejecutar:
 *   DH APPS → Ficha → Dirección → La Libertad / Santa Tecla
 *
 * Ejecutar SOLO si el cliente efectivamente está en Santa Tecla:
 *   npx tsx prisma/scripts/fix-dh-apps-municipality.ts
 *
 * Si DH APPS está en OTRO municipio de La Libertad, cambiar el
 * municipio correcto antes de ejecutar.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DH_APPS_ID = "4f04fe4e-c91e-4d95-ba9c-7140366cb275";

async function main() {
  console.log("── Corrección municipio DH APPS ──────────────────");

  const before = await prisma.customer.findUnique({
    where: { id: DH_APPS_ID },
    select: { name: true, dept_code: true, municipality_code: true },
  });

  if (!before) {
    console.error("  ✗ Cliente DH APPS no encontrado. Verificar ID.");
    process.exit(1);
  }

  console.log(`  Antes:  dept=${before.dept_code} | mun=${before.municipality_code}`);

  // Verificar que el nuevo municipio existe en catálogo
  const mun = await prisma.municipality.findUnique({
    where: { dept_code_code: { dept_code: "05", code: "11" } },
    select: { name: true, dte_full_code: true },
  });

  if (!mun) {
    console.error("  ✗ Municipio 05/11 no encontrado. Ejecutar seed primero.");
    process.exit(1);
  }

  console.log(`  Municipio destino: ${mun.name} (dte_full_code: ${mun.dte_full_code})`);

  const updated = await prisma.customer.update({
    where: { id: DH_APPS_ID },
    data: { municipality_code: "11" },
    select: { dept_code: true, municipality_code: true },
  });

  console.log(`  Después: dept=${updated.dept_code} | mun=${updated.municipality_code}`);
  console.log("  ✅ Corrección aplicada.");
  console.log("─────────────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error("❌ Error:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
