/**
 * purge-all-client-memberships.ts
 *
 * Elimina TODAS las asignaciones de membresía de clientes (ClientMembership),
 * sin importar su estado (active, expired, cancelled, pending, etc.).
 *
 * NO borra:
 *   - Clientes (Client)
 *   - Planes de membresía (MembershipPlan)
 *   - Usuarios (User)
 *   - Ningún otro dato del sistema
 *
 * USO:
 *   Dry run (ver qué borraría, sin tocar nada):
 *     npx ts-node --project tsconfig.json prisma/scripts/purge-all-client-memberships.ts
 *
 *   Aplicar limpieza:
 *     npx ts-node --project tsconfig.json prisma/scripts/purge-all-client-memberships.ts --apply
 *
 *   Con filtros opcionales:
 *     npx ts-node --project tsconfig.json prisma/scripts/purge-all-client-memberships.ts --tenant-id=<ID> --apply
 *     npx ts-node --project tsconfig.json prisma/scripts/purge-all-client-memberships.ts --location-id=<ID> --apply
 *     npx ts-node --project tsconfig.json prisma/scripts/purge-all-client-memberships.ts --client-id=<ID> --apply
 *
 * MODELO AFECTADO:
 *   ClientMembership → tabla "client_memberships"
 *   Sin hijos directos en el schema: eliminación directa con deleteMany.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Parsear argumentos ────────────────────────────────────────

function parseArgs(): {
  apply: boolean;
  tenantId: string | null;
  locationId: string | null;
  clientId: string | null;
} {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");

  const get = (prefix: string) => {
    const found = args.find((a) => a.startsWith(prefix));
    return found ? found.replace(prefix, "").trim() : null;
  };

  return {
    apply,
    tenantId:   get("--tenant-id="),
    locationId: get("--location-id="),
    clientId:   get("--client-id="),
  };
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  const { apply, tenantId, locationId, clientId } = parseArgs();

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   purge-all-client-memberships               ║");
  console.log(`║   Modo: ${apply ? "APPLY — borrará datos  " : "DRY RUN — no borra nada"}         ║`);
  console.log("╚══════════════════════════════════════════════╝\n");

  if (!apply) {
    console.log("  ⚠️  DRY RUN activo. Nada será borrado.");
    console.log("  Agrega --apply para ejecutar el borrado real.\n");
  }

  // Construcción del filtro
  const where: Record<string, unknown> = {};
  if (tenantId)   { where.tenant_id   = tenantId;   console.log(`  Filtro: tenant_id   = ${tenantId}`);   }
  if (locationId) { where.location_id = locationId; console.log(`  Filtro: location_id = ${locationId}`); }
  if (clientId)   { where.client_id   = clientId;   console.log(`  Filtro: client_id   = ${clientId}`);   }
  if (tenantId || locationId || clientId) console.log();

  // 1. Buscar todas las asignaciones
  const memberships = await prisma.clientMembership.findMany({
    where,
    include: {
      client:          { select: { first_name: true, last_name: true, email: true } },
      membership_plan: { select: { name: true } },
      branch:          { select: { name: true } },
    },
    orderBy: [{ client_id: "asc" }, { start_date: "asc" }],
  });

  if (memberships.length === 0) {
    console.log("  ✅ No se encontraron asignaciones de membresía. Nada que borrar.");
    return;
  }

  // 2. Mostrar listado detallado
  console.log(`  Asignaciones encontradas: ${memberships.length}\n`);
  console.log("  ──────────────────────────────────────────────");

  for (const m of memberships) {
    const start = m.start_date.toISOString().split("T")[0];
    const end   = m.end_date.toISOString().split("T")[0];
    console.log(`  ${apply ? "[BORRAR]" : "[candidata]"}  id: ${m.id}`);
    console.log(`    cliente  : ${m.client.first_name} ${m.client.last_name} (${m.client.email})`);
    console.log(`    plan     : ${m.membership_plan.name}`);
    console.log(`    estado   : ${m.status}  |  pago: ${m.payment_status}`);
    console.log(`    período  : ${start} → ${end}`);
    console.log(`    sucursal : ${m.branch.name}`);
    console.log();
  }

  console.log("  ──────────────────────────────────────────────");
  console.log(`  Total asignaciones : ${memberships.length}`);
  console.log("  ──────────────────────────────────────────────\n");

  console.log("  Lo que se conserva:");
  console.log("    ✅ Clientes (Client)");
  console.log("    ✅ Planes de membresía (MembershipPlan)");
  console.log("    ✅ Usuarios (User)");
  console.log("    ✅ Cualquier otro dato del sistema\n");

  if (!apply) {
    console.log("  Para borrar estas asignaciones, ejecuta:");
    const extra = [
      tenantId   ? `--tenant-id=${tenantId}`     : "",
      locationId ? `--location-id=${locationId}` : "",
      clientId   ? `--client-id=${clientId}`     : "",
    ].filter(Boolean).join(" ");
    console.log(`    npx ts-node --project tsconfig.json prisma/scripts/purge-all-client-memberships.ts ${extra}--apply\n`.replace("  --apply", " --apply"));
    return;
  }

  // 3. Borrado
  console.log("  🗑️  Eliminando asignaciones...");

  const ids = memberships.map((m) => m.id);

  const result = await prisma.$transaction([
    prisma.clientMembership.deleteMany({
      where: { id: { in: ids } },
    }),
  ]);

  const deleted = result[0].count;

  console.log("\n  ╔══════════════════════════════════════════╗");
  console.log("  ║  ✅ Limpieza completada                  ║");
  console.log("  ╚══════════════════════════════════════════╝");
  console.log(`\n    Asignaciones eliminadas : ${deleted}`);
  console.log("    Clientes intactos        : ✅");
  console.log("    Planes intactos          : ✅");
  console.log("    Usuarios intactos        : ✅");
  console.log("\n  El portal cliente ya no mostrará membresías activas anteriores.");
}

main()
  .catch((e) => {
    console.error("\n❌ Error durante la limpieza:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
