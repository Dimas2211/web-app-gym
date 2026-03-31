/**
 * seed.ts — Orquestador de seeds
 *
 * Lee SEED_MODE y ejecuta las capas correspondientes:
 *
 *   demo     → catálogos + gym demo + usuarios/clientes/clases/planes ficticios
 *   base     → catálogos + gym/sucursal/super_admin reales (sin datos demo)
 *   catalogs → solo catálogos globales: Sports y Goals (sin gym ni usuarios)
 *
 * Precedencia de SEED_MODE (de mayor a menor):
 *   1. Variable de entorno del proceso (ej: cross-env en npm scripts)
 *   2. Archivo .env (leído por dotenv)
 *   3. Valor por defecto: "demo"
 *
 * Comandos:
 *   npx prisma db seed           → usa SEED_MODE del .env
 *   npm run db:seed:demo         → fuerza modo demo
 *   npm run db:seed:base         → fuerza modo base
 *   npm run db:seed:catalogs     → fuerza modo catalogs
 *
 * ⚠️  Este seed es ADITIVO (idempotente): NO borra datos existentes.
 *     Para empezar desde cero: npx prisma migrate reset --skip-seed
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { seedCatalogs } from "./seeds/seed.catalogs";
import { seedBase } from "./seeds/seed.base";
import { seedDemo } from "./seeds/seed.demo";

const prisma = new PrismaClient();

const VALID_MODES = ["demo", "base", "catalogs"] as const;
type SeedMode = (typeof VALID_MODES)[number];

// ============================================================
// DIAGNÓSTICO: detectar de dónde viene SEED_MODE
// ============================================================
function detectMode(): { mode: SeedMode; source: string } {
  const raw = process.env.SEED_MODE;

  if (!raw || raw.trim() === "") {
    console.log('  ⚠️  SEED_MODE no definido en el entorno. Usando valor por defecto: "demo"');
    return { mode: "demo", source: "default" };
  }

  const cleaned = raw.trim().toLowerCase();

  if (!VALID_MODES.includes(cleaned as SeedMode)) {
    console.error(
      `\n❌ SEED_MODE inválido: "${cleaned}"\n   Valores válidos: ${VALID_MODES.join(" | ")}\n`,
    );
    process.exit(1);
  }

  // Determinar si vino de cross-env (ya estaba en el entorno antes de dotenv)
  // o del .env (dotenv lo cargó). No es 100% determinístico, pero es orientativo.
  const source = process.env.npm_lifecycle_event?.includes("seed")
    ? "npm script (cross-env)"
    : ".env o entorno externo";

  return { mode: cleaned as SeedMode, source };
}

// ============================================================
// DIAGNÓSTICO: estado actual de la base de datos
// ============================================================
async function printDbState(): Promise<void> {
  const [gyms, users, clients, trainers, memberships, classes] = await Promise.all([
    prisma.gym.count(),
    prisma.user.count(),
    prisma.client.count(),
    prisma.trainer.count(),
    prisma.clientMembership.count(),
    prisma.scheduledClass.count(),
  ]);

  console.log("\n  Estado actual de la base de datos:");
  console.log(`    Gyms:        ${gyms}`);
  console.log(`    Usuarios:    ${users}`);
  console.log(`    Clientes:    ${clients}`);
  console.log(`    Entrenadores:${trainers}`);
  console.log(`    Membresías:  ${memberships}`);
  console.log(`    Clases:      ${classes}`);

  if (gyms > 0 || users > 0) {
    console.log(
      "\n  ⚠️  La base YA TIENE DATOS. Este seed es aditivo: no borra ni duplica.",
    );
    console.log(
      "     Para empezar desde cero: npx prisma migrate reset --skip-seed",
    );
  } else {
    console.log("\n  ✅ Base vacía. Se crearán los datos del modo seleccionado.");
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   🌱 Sistema GYM — Orquestador de Seeds      ║");
  console.log("╚══════════════════════════════════════════════╝");

  // --- Detectar modo ---
  const { mode, source } = detectMode();

  console.log(`\n  SEED_MODE detectado : "${mode}"`);
  console.log(`  Fuente              : ${source}`);

  // --- Describir qué se va a ejecutar ---
  const PLAN: Record<SeedMode, string> = {
    demo:     "seedCatalogs  →  seedDemo  (catálogos + todo el contenido ficticio)",
    base:     "seedCatalogs  →  seedBase  (catálogos + gym/sucursal/admin real)",
    catalogs: "seedCatalogs  (solo Sport y Goal — sin gym ni usuarios)",
  };
  console.log(`  Ejecutando          : ${PLAN[mode]}`);

  // --- Estado actual ---
  await printDbState();

  console.log("\n──────────────────────────────────────────────");

  // ============================================================
  // MODO: catalogs
  // Solo catálogos globales. No toca ningún gym ni usuario.
  // ============================================================
  if (mode === "catalogs") {
    await seedCatalogs(prisma);

    console.log("\n──────────────────────────────────────────────");
    console.log("✅ Modo CATALOGS completado.");
    console.log("\n   Creado / actualizado:");
    console.log("     • Sport (15 deportes)");
    console.log("     • Goal  (7 metas de entrenamiento)");
    console.log("\n   NO se creó: gym, sucursal, usuarios, planes, clases.");
    return;
  }

  // ============================================================
  // MODO: base
  // Catálogos + estructura mínima para un cliente real.
  // NO ejecuta seedDemo. No crea usuarios ficticios.
  // ============================================================
  if (mode === "base") {
    await seedCatalogs(prisma);
    const ctx = await seedBase(prisma);

    console.log("\n──────────────────────────────────────────────");
    console.log("✅ Modo BASE completado.");
    console.log("\n   Creado / actualizado:");
    console.log("     • Sport (15 deportes)");
    console.log("     • Goal  (7 metas de entrenamiento)");
    console.log(`     • Gym   → "${ctx.gym.name}"  (slug: ${ctx.gym.slug})`);
    console.log(`     • Branch → "${ctx.branch.name}"`);
    console.log(`     • User  → ${ctx.adminUser.email}  [super_admin]`);
    console.log("\n   NO se creó: usuarios demo, clientes, membresías, clases, planes semanales.");
    console.log("\n   Credenciales del super admin:");
    console.log(`     Email:      ${ctx.adminUser.email}`);
    const pwd = process.env.BASE_ADMIN_PASSWORD ?? "Cambiar1234!";
    console.log(`     Contraseña: ${pwd}`);
    console.log("\n   Próximos pasos desde la UI:");
    console.log("     1. Ingresar y cambiar contraseña");
    console.log("     2. Completar datos del gym en Configuración > Gimnasio");
    console.log("     3. Crear planes de membresía en Membresías > Planes");
    console.log("     4. Crear tipos de clase en Clases > Tipos");
    console.log("     5. Crear usuarios de staff en Usuarios");
    return;
  }

  // ============================================================
  // MODO: demo (default)
  // Catálogos + gym demo + contenido ficticio completo.
  // NO llama a seedBase. seedDemo crea su propio gym "power-gym-demo".
  // ============================================================
  await seedCatalogs(prisma);
  await seedDemo(prisma);

  console.log("\n──────────────────────────────────────────────");
  console.log("✅ Modo DEMO completado.");
  console.log("\n   Creado / actualizado:");
  console.log("     • Sport (15) + Goal (7)");
  console.log("     • Gym: Power Gym  (slug: power-gym-demo)");
  console.log("     • Branch: Sucursal Central");
  console.log("     • Usuarios demo (5 roles) + 2 clientes con acceso a portal");
  console.log("     • 8 clientes adicionales solo admin");
  console.log("     • 7 planes de membresía");
  console.log("     • 3 tipos de clase + 8 clases programadas");
  console.log("     • 4 entrenadores (1 con cuenta + 3 sin cuenta)");
  console.log("     • 4 plantillas de plan semanal");
  console.log("     • Planes personalizados asignados a clientes demo");
  console.log(
    "\n╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║  📋 Credenciales demo  —  contraseña: Demo1234!              ║",
  );
  console.log(
    "╠══════════════════════════════════════════════════════════════╣",
  );
  console.log(
    "║  super@powergym.demo              →  super_admin             ║",
  );
  console.log(
    "║  admin@sucursal1.demo             →  branch_admin            ║",
  );
  console.log(
    "║  recepcion@sucursal1.demo         →  reception               ║",
  );
  console.log(
    "║  trainer@sucursal1.demo           →  trainer                 ║",
  );
  console.log(
    "║  cliente@powergym.demo            →  client  →  /portal      ║",
  );
  console.log(
    "║  cliente_natacion@powergym.demo   →  client  →  /portal      ║",
  );
  console.log(
    "╠══════════════════════════════════════════════════════════════╣",
  );
  console.log(
    "║  🔗 Portal cliente:  http://localhost:3000/portal            ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝",
  );
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
