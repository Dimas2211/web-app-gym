/**
 * purge-class-by-id.ts
 *
 * Purga forzada de una ScheduledClass específica por ID.
 * Elimina primero sus registros hijos (ClassBooking, ClassAttendance)
 * y luego la clase, todo en una transacción atómica.
 *
 * USO:
 *   Dry run (ver qué borraría, sin tocar nada):
 *     npx ts-node --project tsconfig.json prisma/scripts/purge-class-by-id.ts --class-id=<ID>
 *
 *   Borrado real:
 *     npx ts-node --project tsconfig.json prisma/scripts/purge-class-by-id.ts --class-id=<ID> --apply
 *
 * REGLAS:
 *   - Requiere --class-id. Sin él, el script termina con error.
 *   - Solo actúa sobre la clase con ese ID exacto.
 *   - Nunca borra nada sin el flag --apply.
 *   - Transacción atómica: si falla algo, ningún registro queda a medias.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Parsear argumentos ────────────────────────────────────────

function parseArgs(): { classId: string | null; apply: boolean } {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");

  const idArg = args.find((a) => a.startsWith("--class-id="));
  const classId = idArg ? idArg.replace("--class-id=", "").trim() : null;

  return { classId, apply };
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  const { classId, apply } = parseArgs();

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║        purge-class-by-id                     ║");
  console.log(`║        Modo: ${apply ? "APPLY — borrará datos  " : "DRY RUN — no borra nada"}       ║`);
  console.log("╚══════════════════════════════════════════════╝\n");

  // Validar que se pasó --class-id
  if (!classId) {
    console.error("❌  Argumento requerido: --class-id=<ID>");
    console.error("\n   Ejemplo:");
    console.error("     npx ts-node --project tsconfig.json prisma/scripts/purge-class-by-id.ts --class-id=abc-123");
    process.exit(1);
  }

  if (!apply) {
    console.log("  ⚠️  DRY RUN activo. Nada será borrado.");
    console.log("  Agrega --apply para ejecutar el borrado.\n");
  }

  // 1. Buscar la clase por ID
  const cls = await prisma.scheduledClass.findUnique({
    where: { id: classId },
    include: {
      trainer:    { select: { first_name: true, last_name: true } },
      branch:     { select: { name: true } },
      class_type: { select: { name: true } },
      _count: {
        select: {
          bookings:   true,
          attendance: true,
        },
      },
    },
  });

  if (!cls) {
    console.error(`❌  No se encontró ninguna ScheduledClass con id: "${classId}"`);
    console.error("   Verifica el ID en Prisma Studio o en la URL de la clase.");
    process.exit(1);
  }

  // 2. Mostrar resumen de la clase encontrada
  const dateStr = cls.class_date.toISOString().split("T")[0];

  console.log("  Clase encontrada:");
  console.log("  ──────────────────────────────────────────────");
  console.log(`    id          : ${cls.id}`);
  console.log(`    título      : ${cls.title}`);
  console.log(`    tipo        : ${cls.class_type.name}`);
  console.log(`    fecha       : ${dateStr}  ${cls.start_time} – ${cls.end_time}`);
  console.log(`    estado      : ${cls.status}`);
  console.log(`    entrenador  : ${cls.trainer.first_name} ${cls.trainer.last_name}`);
  console.log(`    sucursal    : ${cls.branch.name}`);
  console.log(`    capacidad   : ${cls.capacity}`);
  console.log(`    bookings    : ${cls._count.bookings}`);
  console.log(`    asistencia  : ${cls._count.attendance}`);
  console.log("  ──────────────────────────────────────────────\n");

  if (!apply) {
    console.log("  Para borrar esta clase y todos sus registros hijos, ejecuta:");
    console.log(`    npx ts-node --project tsconfig.json prisma/scripts/purge-class-by-id.ts --class-id=${classId} --apply\n`);
    return;
  }

  // 3. Confirmar visualmente antes de borrar
  console.log(`  🗑️  Borrando clase "${cls.title}" (${dateStr}) y sus ${cls._count.bookings} booking(s) y ${cls._count.attendance} asistencia(s)...`);

  // 4. Transacción atómica: hijos primero, luego la clase
  const [deletedBookings, deletedAttendance, deletedClass] =
    await prisma.$transaction([
      prisma.classBooking.deleteMany({
        where: { scheduled_class_id: classId },
      }),
      prisma.classAttendance.deleteMany({
        where: { scheduled_class_id: classId },
      }),
      prisma.scheduledClass.delete({
        where: { id: classId },
      }),
    ]);

  // 5. Resultado final
  console.log("\n  ╔══════════════════════════════════════════╗");
  console.log("  ║  ✅ Borrado completado                   ║");
  console.log("  ╚══════════════════════════════════════════╝");
  console.log(`\n    Clase eliminada     : "${deletedClass.title}" (${dateStr})`);
  console.log(`    Bookings eliminados : ${deletedBookings.count}`);
  console.log(`    Asistencia borrada  : ${deletedAttendance.count}`);
  console.log("\n  El portal cliente ya no mostrará esta clase.");
}

main()
  .catch((e) => {
    console.error("\n❌ Error durante la purga:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
