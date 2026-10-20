/**
 * preflight-gym-bookings.ts
 *
 * GYM-BOOKINGS 2A — preflight READ-ONLY por base, antes y después de
 * 20261019000000_gym_bookings_foundation.
 *
 * Garantías:
 *  - Solo conecta a la URL de GYM_PREFLIGHT_DATABASE_URL. Nunca cae a
 *    DATABASE_URL / DIRECT_URL (no importa dotenv).
 *  - Todo corre dentro de una transacción `SET TRANSACTION READ ONLY`: el
 *    propio PostgreSQL rechaza cualquier escritura.
 *  - Nunca imprime la URL completa ni datos personales (solo IDs técnicos).
 *  - Fase automática: si scheduled_classes.booked_count no existe, corre
 *    las comprobaciones "pre"; si existe, corre "pre" + "post".
 *
 * USO (PowerShell):
 *   $env:GYM_PREFLIGHT_DATABASE_URL = "<url de la base a revisar>"
 *   npx tsx prisma/scripts/gym-bookings/preflight-gym-bookings.ts [--samples]
 *
 * Salida: exit 0 sin BLOCKER, exit 2 con algún BLOCKER, exit 1 por error.
 */

import { PrismaClient } from "@prisma/client";
import {
  GYM_BOOKINGS_PREFLIGHT_CHECKS,
  type GymPreflightCheck,
} from "./preflight-gym-bookings.queries";

export function describeUrlSafely(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "<url inválida>";
  }
}

async function main() {
  const url = process.env.GYM_PREFLIGHT_DATABASE_URL;
  if (!url) {
    console.error("✗ Falta GYM_PREFLIGHT_DATABASE_URL. Este script no usa DATABASE_URL ni DIRECT_URL.");
    process.exitCode = 1;
    return;
  }
  const withSamples = process.argv.includes("--samples");
  const prisma = new PrismaClient({ datasourceUrl: url });

  console.log(`GYM-BOOKINGS 2A preflight (READ ONLY) → ${describeUrlSafely(url)}`);

  try {
    const report = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '60s'");

        const [{ migrated }] = await tx.$queryRawUnsafe<{ migrated: boolean }[]>(
          `SELECT EXISTS (
             SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema()
                AND table_name = 'scheduled_classes' AND column_name = 'booked_count'
           ) AS migrated`
        );
        const checks = GYM_BOOKINGS_PREFLIGHT_CHECKS.filter(
          (c: GymPreflightCheck) => c.phase === "pre" || migrated
        );

        const rows: { check: GymPreflightCheck; n: number; sample?: unknown[] }[] = [];
        for (const check of checks) {
          const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(check.countSql);
          const sample =
            withSamples && n > 0 && check.sampleSql
              ? await tx.$queryRawUnsafe<unknown[]>(check.sampleSql)
              : undefined;
          rows.push({ check, n: Number(n), sample });
        }
        return { migrated, rows };
      },
      { timeout: 120_000 }
    );

    console.log(`Migración 2A aplicada: ${report.migrated ? "SÍ (pre + post)" : "NO (solo pre)"}\n`);
    let blockers = 0;
    for (const { check, n, sample } of report.rows) {
      const flag = n === 0 ? "OK  " : check.severity === "BLOCKER" ? "STOP" : check.severity === "WARNING" ? "WARN" : "INFO";
      if (n > 0 && check.severity === "BLOCKER") blockers++;
      console.log(`${flag} [${check.severity}] ${check.id} = ${n}  — ${check.title}`);
      if (sample?.length) console.log(`       muestra: ${JSON.stringify(sample)}`);
    }
    console.log(`\nBLOCKERS: ${blockers}`);
    if (blockers > 0) process.exitCode = 2;
  } catch (err) {
    const message = err instanceof Error ? err.message.replace(url, "<redacted>") : String(err);
    console.error(`✗ Preflight falló: ${message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && /preflight-gym-bookings\.ts$/.test(process.argv[1])) {
  void main();
}
