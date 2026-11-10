/**
 * scripts/showcase/setup.ts — npm run showcase:setup [commerce|gym]
 *
 * (Re)crea desde cero las bases locales de vitrina usadas para las capturas
 * de la landing y las llena con datos de demostración:
 *
 *   zolvi_showcase_commerce → Ferretería El Roble (Commerce, 3 sucursales)
 *   zolvi_showcase_gym      → Fuerza Total Gym   (GYM, 2 sucursales)
 *
 * - Solo PostgreSQL local. Nunca toca la base de DATABASE_URL (zolvi_local)
 *   ni ninguna base remota: usa el mismo servidor con otro nombre de base.
 * - DROP + CREATE + `prisma migrate deploy` + seeds. Sin cambios de schema.
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { SHOWCASE_DBS, showcaseEnv, showcaseUrl, type ShowcaseTarget } from "./showcase-env";

const STEPS: Record<
  ShowcaseTarget,
  { label: string; cmd: string; env?: Record<string, string> }[]
> = {
  commerce: [
    {
      label: "Catálogos globales + Platform",
      cmd: "npx tsx prisma/seed.ts",
      env: { SEED_MODE: "catalogs" },
    },
    { label: "Ferretería El Roble", cmd: "npx tsx prisma/showcase/seed-showcase-commerce.ts" },
  ],
  gym: [
    { label: "Demo GYM base", cmd: "npx tsx prisma/seed.ts", env: { SEED_MODE: "demo" } },
    { label: "Fuerza Total Gym", cmd: "npx tsx prisma/showcase/seed-showcase-gym.ts" },
  ],
};

function run(cmd: string, env: NodeJS.ProcessEnv) {
  execSync(cmd, { env, stdio: "inherit" });
}

const arg = process.argv[2] as ShowcaseTarget | undefined;
const targets: ShowcaseTarget[] = arg ? [arg] : ["commerce", "gym"];
if (arg && !(arg in SHOWCASE_DBS)) {
  console.error(`Destino desconocido "${arg}". Use: commerce | gym`);
  process.exit(1);
}

async function main() {
  for (const target of targets) {
    const db = SHOWCASE_DBS[target];
    const env = showcaseEnv(target);
    console.log(`\n━━━ ${db} ━━━`);

    // DROP/CREATE desde la base de mantenimiento "postgres" (fuera de
    // transacción; la URL nunca va en la línea de comandos).
    const admin = new PrismaClient({ datasourceUrl: showcaseUrl("postgres") });
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${db}"`);
    await admin.$disconnect();
    run("npx prisma migrate deploy", env);
    for (const step of STEPS[target]) {
      console.log(`\n→ ${step.label}`);
      run(step.cmd, { ...env, ...step.env });
    }
  }
  console.log("\n✅ Bases de vitrina listas. Siguiente paso: npm run showcase:capture\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
