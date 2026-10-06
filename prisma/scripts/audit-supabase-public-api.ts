/**
 * audit-supabase-public-api.ts
 *
 * SUPABASE-PUBLIC-API-HARDENING — auditoría READ-ONLY de la exposición del
 * schema `public` a la Supabase Data API (roles anon/authenticated).
 * Reutiliza `auditSupabasePublicApiSecurity` (el mismo motor del Preflight).
 * Ejecuta una única SELECT sobre catálogos `pg_*` dentro de una transacción
 * `READ ONLY`. Nunca escribe, nunca imprime URLs ni passwords.
 *
 * Exit code: 0 = PASS / NOT_APPLICABLE, 1 = FAIL, 2 = error.
 *
 * ── USO (PowerShell) ──────────────────────────────────────────────────
 *
 *   # Base del proceso (DATABASE_URL del .env — local o Control Plane)
 *   npx tsx prisma/scripts/audit-supabase-public-api.ts
 *
 *   # Runtime de una organización, vía Runtime Database Router (Control
 *   # Plane + PLATFORM_ENCRYPTION_KEY en el entorno)
 *   npx tsx prisma/scripts/audit-supabase-public-api.ts --org "TRUSTME-0001"
 *
 *   # URL tomada de un archivo .env (sin imprimirla); var por defecto DIRECT_URL
 *   npx tsx prisma/scripts/audit-supabase-public-api.ts `
 *     --env-file .env.trustme-remote --env-var DIRECT_URL
 *
 *   # Salida JSON completa (snapshot + findings)
 *   ... --json
 *
 *   # Artefacto de rollback: genera (NO ejecuta) los GRANT que restauran el
 *   # ACL actual de anon/authenticated/PUBLIC. Correr ANTES del hardening.
 *   # Guardar FUERA del repo.
 *   ... --rollback-sql "$HOME\zolvi-backups\trustme-acl-before-hardening.sql"
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { controlPlanePrisma } from "../../src/modules/platform/runtime/control-plane-prisma";
import { withRuntimePrisma } from "../../src/modules/platform/runtime/runtime-database-router";
import { sanitizeDatabaseError } from "../../src/modules/platform/lib/database-profile-url";
import {
  auditSupabasePublicApiSecurity,
  generateSupabaseApiAclRestoreSql,
  type SupabasePublicApiAuditResult,
} from "../../src/modules/platform/lib/supabase-public-api-audit";

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

interface AuditOutput {
  result:     SupabasePublicApiAuditResult;
  restoreSql: string[] | null;
}

async function auditReadOnly(client: PrismaClient): Promise<AuditOutput> {
  const withRestore = Boolean(argValue("--rollback-sql"));
  return client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return {
      result:     await auditSupabasePublicApiSecurity(tx),
      restoreSql: withRestore ? await generateSupabaseApiAclRestoreSql(tx) : null,
    };
  });
}

async function auditFromUrl(url: string): Promise<AuditOutput> {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    return await auditReadOnly(client);
  } finally {
    await client.$disconnect();
  }
}

async function run(): Promise<{ target: string; output: AuditOutput }> {
  const org = argValue("--org");
  const envFile = argValue("--env-file");

  if (org) {
    const organization = await controlPlanePrisma.platformOrganization.findFirst({
      where:  { OR: [{ id: org }, { code: org }] },
      select: { id: true, code: true, name: true },
    });
    if (!organization) throw new Error(`Organización no encontrada: ${org}`);
    const output = await withRuntimePrisma({ organizationId: organization.id }, (client) => auditReadOnly(client));
    return { target: `organización ${organization.name} (${organization.code}) vía Runtime Router`, output };
  }

  if (envFile) {
    const envVar = argValue("--env-var") ?? "DIRECT_URL";
    const url = dotenv.parse(fs.readFileSync(envFile))[envVar]?.replace(/^"|"$/g, "");
    if (!url) throw new Error(`${envVar} no está definido en ${envFile}`);
    return { target: `${envFile} (${envVar})`, output: await auditFromUrl(url) };
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está definido");
  return { target: "DATABASE_URL del proceso", output: await auditFromUrl(url) };
}

async function main() {
  const { target, output } = await run();
  const { result, restoreSql } = output;
  const s = result.summary;

  const rollbackFile = argValue("--rollback-sql");
  if (rollbackFile && restoreSql) {
    const header = [
      `-- Rollback dirigido SUPABASE-PUBLIC-API-HARDENING — generado ${new Date().toISOString()}`,
      `-- Target: ${target} | migrador: ${result.snapshot.currentUser}`,
      "-- Restaura EXACTAMENTE el ACL previo de anon/authenticated/PUBLIC (estado INSEGURO).",
      "-- NO ejecutar completo salvo decisión explícita; preferir restaurar solo la sentencia",
      "-- que cubra la dependencia concreta identificada. Ver docs/modules/supabase-public-api-hardening.md §9.",
      "BEGIN;",
    ];
    fs.mkdirSync(path.dirname(rollbackFile), { recursive: true });
    fs.writeFileSync(rollbackFile, [...header, ...restoreSql, "COMMIT;", ""].join("\n"), "utf8");
    console.log(`Artefacto de rollback escrito: ${rollbackFile} (${restoreSql.length} sentencias, no ejecutado)`);
  }

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ target, ...result }, null, 2));
  } else {
    console.log(`Supabase Data API audit — ${target}`);
    console.log(`  migrador (current_user):        ${result.snapshot.currentUser}`);
    console.log(`  anon role exists:               ${s.anonRoleExists}`);
    console.log(`  authenticated role exists:      ${s.authenticatedRoleExists}`);
    console.log(`  public schema → anon USAGE:     ${s.anonSchemaUsage}`);
    console.log(`  public schema → auth USAGE:     ${s.authenticatedSchemaUsage}`);
    console.log(`  PUBLIC pseudo-role USAGE:       ${result.snapshot.publicPseudoRoleHasUsage}`);
    console.log(`  tables accessible by anon:      ${s.tablesAccessibleByAnon}`);
    console.log(`  tables accessible by auth:      ${s.tablesAccessibleByAuthenticated}`);
    console.log(`  dangerous object grants:        ${s.dangerousObjectGrants}`);
    console.log(`  dangerous default ACLs:         ${s.dangerousDefaultAcls}`);
    console.log(`  unmanaged default ACLs:         ${s.unmanagedDefaultAcls}`);
    console.log(`  RLS (info):                     ${s.rlsEnabledTables}/${s.totalTables}`);
    for (const f of result.findings) console.log(`  [${f.severity}] ${f.code}: ${f.message}`);
    console.log(`RESULT=${result.status}`);
  }

  process.exitCode = result.status === "FAIL" ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(`ERROR: ${sanitizeDatabaseError(err)}`);
    process.exitCode = 2;
  })
  .finally(() => controlPlanePrisma.$disconnect());
