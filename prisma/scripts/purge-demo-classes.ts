/**
 * purge-demo-classes.ts
 *
 * Limpieza FORZADA de clases demo en ScheduledClass.
 * Borra los hijos (ClassBooking, ClassAttendance) antes de borrar la clase.
 * Todo en una sola transacción atómica.
 *
 * USO:
 *   Dry run (solo lista, no borra nada):
 *     npx ts-node --project tsconfig.json prisma/scripts/purge-demo-classes.ts
 *
 *   Aplicar (borrado real):
 *     npx ts-node --project tsconfig.json prisma/scripts/purge-demo-classes.ts --apply
 *
 * REGLAS:
 *   - Solo actúa sobre los títulos en DEMO_TITLES.
 *   - Nunca toca clases con otros títulos.
 *   - Transacción atómica: si falla algo, nada queda borrado a medias.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Títulos exactos generados por seed.demo.ts
const DEMO_TITLES = [
  "Yoga matutino",
  "Spinning matutino",
  "Yoga restaurativo",
  "Spinning power",
  "Spinning nocturno",
  "Yoga nocturno",
];

async function main() {
  const isApply = process.argv.includes("--apply");

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║       purge-demo-classes                     ║");
  console.log(`║       Modo: ${isApply ? "APPLY — borrará datos  " : "DRY RUN — no borra nada"}       ║`);
  console.log("╚══════════════════════════════════════════════╝");

  if (!isApply) {
    console.log("\n  ⚠️  DRY RUN activo. Ejecutar con --apply para borrar.\n");
  }

  // 1. Buscar clases candidatas
  const classes = await prisma.scheduledClass.findMany({
    where: { title: { in: DEMO_TITLES } },
    include: {
      trainer: { select: { first_name: true, last_name: true } },
      branch:  { select: { name: true } },
      _count: {
        select: {
          bookings:    true,
          attendance:  true,
        },
      },
    },
    orderBy: [{ class_date: "asc" }, { start_time: "asc" }],
  });

  if (classes.length === 0) {
    console.log("  ✅ No se encontraron clases demo con esos títulos. Nada que hacer.");
    return;
  }

  // 2. Mostrar resumen detallado
  console.log(`  Clases encontradas: ${classes.length}\n`);
  console.log("  ──────────────────────────────────────────────");

  let totalBookings    = 0;
  let totalAttendance  = 0;

  for (const cls of classes) {
    const date = cls.class_date.toISOString().split("T")[0];
    totalBookings   += cls._count.bookings;
    totalAttendance += cls._count.attendance;

    console.log(`  ${isApply ? "[BORRAR]" : "[candidata]"} ${cls.title}`);
    console.log(`    id        : ${cls.id}`);
    console.log(`    fecha     : ${date}  ${cls.start_time} – ${cls.end_time}`);
    console.log(`    status    : ${cls.status}`);
    console.log(`    entrenador: ${cls.trainer.first_name} ${cls.trainer.last_name}`);
    console.log(`    sucursal  : ${cls.branch.name}`);
    console.log(`    bookings  : ${cls._count.bookings}`);
    console.log(`    asistencia: ${cls._count.attendance}`);
    console.log();
  }

  console.log("  ──────────────────────────────────────────────");
  console.log(`  Total clases     : ${classes.length}`);
  console.log(`  Total bookings   : ${totalBookings}`);
  console.log(`  Total attendance : ${totalAttendance}`);
  console.log("  ──────────────────────────────────────────────\n");

  if (!isApply) {
    console.log("  Para borrar todo lo anterior, ejecuta:");
    console.log("    npx ts-node --project tsconfig.json prisma/scripts/purge-demo-classes.ts --apply\n");
    return;
  }

  // 3. Confirmación antes de borrar
  const ids = classes.map((c) => c.id);

  console.log("  🗑️  Iniciando borrado atómico...\n");

  const [deletedBookings, deletedAttendance, deletedClasses] =
    await prisma.$transaction([
      prisma.classBooking.deleteMany({
        where: { scheduled_class_id: { in: ids } },
      }),
      prisma.classAttendance.deleteMany({
        where: { scheduled_class_id: { in: ids } },
      }),
      prisma.scheduledClass.deleteMany({
        where: { id: { in: ids } },
      }),
    ]);

  // 4. Resultado final
  console.log("  ╔══════════════════════════════════════════╗");
  console.log("  ║  ✅ Borrado completado                   ║");
  console.log("  ╚══════════════════════════════════════════╝");
  console.log(`\n    Clases eliminadas     : ${deletedClasses.count}`);
  console.log(`    Bookings eliminados   : ${deletedBookings.count}`);
  console.log(`    Asistencia eliminada  : ${deletedAttendance.count}`);
  console.log("\n  El portal cliente ya no mostrará estas clases.");
}

main()
  .catch((e) => {
    console.error("\n❌ Error durante la limpieza:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
