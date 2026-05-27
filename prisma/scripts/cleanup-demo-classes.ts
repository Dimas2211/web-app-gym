/**
 * cleanup-demo-classes.ts
 *
 * Limpieza segura de clases demo/antiguas en ScheduledClass.
 *
 * Comportamiento:
 *   - Por defecto: DRY RUN — lista qué eliminaría sin borrar nada.
 *   - Con --apply: elimina solo clases sin bookings ni attendance.
 *   - Clases con bookings o attendance: reportadas como "requieren cancelación manual".
 *
 * Uso:
 *   npx ts-node --project tsconfig.json prisma/scripts/cleanup-demo-classes.ts
 *   npx ts-node --project tsconfig.json prisma/scripts/cleanup-demo-classes.ts --apply
 *
 * Criterio de identificación de clases demo:
 *   Títulos típicos del seed.demo.ts. Se puede ajustar DEMO_TITLES según el entorno.
 *
 * Reglas de seguridad:
 *   1. NUNCA elimina clases con bookings confirmados.
 *   2. NUNCA elimina clases con attendance registrada.
 *   3. Solo candidatas: clases cuyo título coincide exactamente con alguno de DEMO_TITLES.
 *   4. Reporta separadamente: "eliminables" vs "solo cancelables".
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Títulos que el seed.demo.ts genera — ajustar si se añaden más
const DEMO_TITLES = [
  "Spinning matutino",
  "Yoga restaurativo",
  "Spinning nocturno",
  "Musculación guiada",
  "Yoga matutino",
  "Spinning power",
  "Yoga nocturno",
];

async function main() {
  const isApply = process.argv.includes("--apply");
  const mode = isApply ? "APPLY" : "DRY RUN";

  console.log("══════════════════════════════════════════════");
  console.log(`  cleanup-demo-classes — Modo: ${mode}`);
  console.log("══════════════════════════════════════════════");

  if (!isApply) {
    console.log("\n  ℹ️  Este es un DRY RUN. No se elimina nada.");
    console.log("  Para aplicar: agrega el flag --apply\n");
  }

  // Buscar candidatas por título
  const candidates = await prisma.scheduledClass.findMany({
    where: {
      title: { in: DEMO_TITLES },
    },
    include: {
      trainer: { select: { first_name: true, last_name: true } },
      branch: { select: { name: true } },
      _count: {
        select: {
          bookings: true,
          attendance: true,
        },
      },
    },
    orderBy: [{ class_date: "asc" }, { start_time: "asc" }],
  });

  if (candidates.length === 0) {
    console.log("  ✅ No se encontraron clases demo con esos títulos.");
    return;
  }

  console.log(`  Encontradas: ${candidates.length} clase(s) con títulos demo\n`);

  const deletable: typeof candidates = [];
  const requiresCancellation: typeof candidates = [];

  for (const cls of candidates) {
    const hasHistory =
      cls._count.bookings > 0 || cls._count.attendance > 0;
    if (hasHistory) {
      requiresCancellation.push(cls);
    } else {
      deletable.push(cls);
    }
  }

  // Reporte: clases eliminables
  console.log(`  ──────────────────────────────────────────`);
  console.log(`  ELIMINABLES (sin reservas ni asistencia): ${deletable.length}`);
  console.log(`  ──────────────────────────────────────────`);
  for (const cls of deletable) {
    const date = cls.class_date.toISOString().split("T")[0];
    console.log(
      `    [${isApply ? "ELIMINANDO" : "candidata"}] ${cls.title}`
    );
    console.log(
      `      fecha: ${date} ${cls.start_time}–${cls.end_time}`
    );
    console.log(
      `      sucursal: ${cls.branch.name} | entrenador: ${cls.trainer.first_name} ${cls.trainer.last_name}`
    );
    console.log(
      `      status: ${cls.status} | id: ${cls.id}`
    );
    console.log();
  }

  // Reporte: clases que solo se pueden cancelar
  console.log(`  ──────────────────────────────────────────`);
  console.log(`  SOLO CANCELABLES (tienen historial): ${requiresCancellation.length}`);
  console.log(`  ──────────────────────────────────────────`);
  for (const cls of requiresCancellation) {
    const date = cls.class_date.toISOString().split("T")[0];
    console.log(
      `    [NO eliminar] ${cls.title}`
    );
    console.log(
      `      fecha: ${date} ${cls.start_time}–${cls.end_time}`
    );
    console.log(
      `      reservas: ${cls._count.bookings} | asistencia: ${cls._count.attendance}`
    );
    console.log(
      `      status: ${cls.status} | id: ${cls.id}`
    );
    console.log();
  }

  // Ejecutar eliminación si --apply
  if (isApply && deletable.length > 0) {
    const ids = deletable.map((c) => c.id);
    const result = await prisma.scheduledClass.deleteMany({
      where: { id: { in: ids } },
    });
    console.log(`  ✅ Eliminadas: ${result.count} clase(s)`);
  } else if (isApply && deletable.length === 0) {
    console.log("  ℹ️  Nada que eliminar.");
  }

  // Resumen final
  console.log("\n  ══════════════════════════════════════════");
  console.log("  RESUMEN");
  console.log("  ══════════════════════════════════════════");
  console.log(`    Candidatas encontradas : ${candidates.length}`);
  console.log(`    Eliminables            : ${deletable.length}`);
  console.log(`    Solo cancelables       : ${requiresCancellation.length}`);
  if (!isApply) {
    console.log("\n  Para eliminar las candidatas, ejecuta:");
    console.log("    npx ts-node --project tsconfig.json prisma/scripts/cleanup-demo-classes.ts --apply");
  }
  if (requiresCancellation.length > 0) {
    console.log("\n  Para las clases con historial, usa el dashboard admin:");
    console.log("    /dashboard/classes?view=upcoming  →  botón 'Cancelar'");
  }
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
