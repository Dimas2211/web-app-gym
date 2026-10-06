/**
 * certify-supabase-public-api-hardening.ts
 *
 * SUPABASE-PUBLIC-API-HARDENING — certificación LOCAL de la migración
 * `20261006000000_harden_supabase_public_data_api`. Solo PostgreSQL local
 * (localhost/127.0.0.1/::1, superusuario con CREATEDB/CREATEROLE).
 * Nunca se conecta a Supabase.
 *
 * Fases:
 *   A) Crea una base desechable `zolvi_sec_cert_<ts>` y corre `prisma
 *      migrate deploy` completo SIN roles Supabase → la migración debe
 *      aplicarse como NOT_APPLICABLE sin tocar el ACL de `public` (TEST 8).
 *   B) Dentro de UNA transacción que termina en ROLLBACK, simula el estado
 *      real de trustme-runtime: roles anon/authenticated/service_role
 *      transitorios, migrador NO superusuario dueño de la base y de las
 *      tablas (como `postgres` en Supabase), grants y default ACLs
 *      peligrosos, y un owner no administrable (como `supabase_admin`).
 *      Ejecuta el migration.sql real dos veces y corre TEST 1–7, más
 *      TEST 9 (fail-closed: un migrador sin privilegios aborta sin cambios)
 *      TEST 10 (el artefacto de rollback restaura el ACL previo exacto),
 *      TEST 11 (base tipo Control Plane: no-op exacto y sin escalamiento),
 *      TEST 12 (grant solo por columna revocado) y TEST 13 (rol legítimo
 *      que dependía de PUBLIC conserva USAGE explícito).
 *   C) ROLLBACK (los roles transitorios nunca se confirman), verifica que
 *      no quedó ningún rol en el cluster y elimina la base desechable.
 *
 * USO:  npx tsx prisma/scripts/certify-supabase-public-api-hardening.ts
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  auditSupabasePublicApiSecurity,
  generateSupabaseApiAclRestoreSql,
} from "../../src/modules/platform/lib/supabase-public-api-audit";
import { sanitizeDatabaseError } from "../../src/modules/platform/lib/database-profile-url";

const MIGRATION_NAME = "20261006000000_harden_supabase_public_data_api";
// CERT_MIGRATION_SQL_PATH permite certificar una variante del SQL en la
// Fase B (p.ej. para demostrar que un test detecta una regresión). La Fase A
// siempre usa la migración real del repo.
const MIGRATION_SQL = fs.readFileSync(
  process.env.CERT_MIGRATION_SQL_PATH ?? path.join(__dirname, "..", "migrations", MIGRATION_NAME, "migration.sql"),
  "utf8",
);
const MIGRATOR = "zolvi_cert_migrator";
const UNMANAGED_OWNER = "zolvi_cert_platform_owner";
const WEAK_MIGRATOR = "zolvi_cert_weak_migrator";
const LEGIT_READER = "zolvi_cert_legit_reader";   // depende de PUBLIC para USAGE
const GRANTEE_ONLY = "zolvi_cert_grantee_only";   // grants de tabla sin USAGE (no debe escalar)
const TRANSIENT_ROLES = [
  "anon", "authenticated", "service_role", MIGRATOR, UNMANAGED_OWNER, WEAK_MIGRATOR, LEGIT_READER, GRANTEE_ONLY,
];

/**
 * Huella de ACLs de `public` entrada por entrada (grantor, grantee,
 * privilegio, grant option) — independiente del orden interno del array
 * ACL: schema, objetos, columnas, funciones y default ACLs.
 */
const ACL_FINGERPRINT_SQL = `
  WITH e AS (
    SELECT 'N' AS k, 'public' AS obj, a.* FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a WHERE n.nspname = 'public'
    UNION ALL
    SELECT 'R', c.relname::text, a.* FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.relnamespace = 'public'::regnamespace
    UNION ALL
    SELECT 'C', c.relname || '.' || att.attname, a.* FROM pg_class c JOIN pg_attribute att ON att.attrelid = c.oid
      CROSS JOIN LATERAL aclexplode(att.attacl) a WHERE c.relnamespace = 'public'::regnamespace
    UNION ALL
    SELECT 'P', p.oid::regprocedure::text, a.* FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.pronamespace = 'public'::regnamespace
    UNION ALL
    SELECT 'D', d.defaclrole::regrole::text || '/' || d.defaclobjtype::text || '/' || d.defaclnamespace::text, a.*
      FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  )
  , lines AS (
    SELECT concat_ws(':', k, obj, grantor::regrole::text,
             CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE grantee::regrole::text END,
             privilege_type, is_grantable::text) AS line
      FROM e
  )
  SELECT coalesce(string_agg(line, ',' ORDER BY line), '') AS v FROM lines`;

/** Diferencia simétrica entre dos huellas (para diagnosticar un FAIL). */
function fingerprintDiff(a: string, b: string): string {
  const sa = new Set(a.split(",")), sb = new Set(b.split(","));
  const onlyA = [...sa].filter((x) => !sb.has(x)).slice(0, 8);
  const onlyB = [...sb].filter((x) => !sa.has(x)).slice(0, 8);
  return onlyA.length || onlyB.length ? ` | solo antes: ${onlyA.join(" ; ")} | solo después: ${onlyB.join(" ; ")}` : "";
}

/**
 * TEST 11 — base tipo Control Plane (schema propiedad del migrador, sin
 * PUBLIC, relacl NULL, sin default ACLs): la migración no cambia ningún ACL
 * y no concede USAGE a un rol con grants de tabla que no lo tenía.
 */
async function certifyControlPlaneLikeNoop(tx: Tx) {
  await tx.$executeRawUnsafe("SAVEPOINT cp_like");
  // Llevar la base al estado real del Control Plane: schema del migrador,
  // sin PUBLIC/anon/authenticated/service_role, sin grants API ni default ACLs.
  await tx.$executeRawUnsafe(`ALTER SCHEMA public OWNER TO ${MIGRATOR}`);
  await tx.$executeRawUnsafe(`REVOKE ALL ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role`);
  for (const kind of ["TABLES", "SEQUENCES", "FUNCTIONS"]) {
    await tx.$executeRawUnsafe(`REVOKE ALL ON ALL ${kind} IN SCHEMA public FROM anon, authenticated, service_role`);
    for (const owner of [MIGRATOR, UNMANAGED_OWNER]) {
      await tx.$executeRawUnsafe(
        `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public REVOKE ALL ON ${kind} FROM anon, authenticated, service_role`,
      );
    }
  }
  await tx.$executeRawUnsafe(`GRANT SELECT ON public.products TO ${GRANTEE_ONLY}`);
  const before = await scalar<string>(tx, ACL_FINGERPRINT_SQL);
  await tx.$executeRawUnsafe(`SET ROLE ${MIGRATOR}`);
  const auditBefore = await auditSupabasePublicApiSecurity(tx);
  await tx.$executeRawUnsafe(MIGRATION_SQL);
  const auditAfter = await auditSupabasePublicApiSecurity(tx);
  await tx.$executeRawUnsafe(`RESET ROLE`);
  const after = await scalar<string>(tx, ACL_FINGERPRINT_SQL);
  const escalated = await scalar<boolean>(tx, `SELECT has_schema_privilege('${GRANTEE_ONLY}', 'public', 'USAGE') AS v`);
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT cp_like");
  check(
    "TEST 11 base tipo Control Plane: ACLs idénticos antes/después y sin escalamiento de USAGE",
    before === after && !escalated && auditBefore.status === "PASS" && auditAfter.status === "PASS",
    `fingerprint ${before === after ? "igual" : "DISTINTO"}, ${GRANTEE_ONLY} USAGE=${escalated}` + fingerprintDiff(before, after),
  );
}
const TABLE_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];

class RollbackSentinel extends Error {}

const results: Array<{ test: string; ok: boolean; detail: string }> = [];
function check(test: string, ok: boolean, detail = "") {
  results.push({ test, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${test}${detail ? ` — ${detail}` : ""}`);
}

function assertLocal(url: URL) {
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error(`Solo se permite PostgreSQL local (host actual: ${url.hostname}).`);
  }
}

type Tx = Prisma.TransactionClient;

/** Ejecuta `sql` y devuelve el código SQLSTATE del error (o null si no falló). */
async function sqlState(tx: Tx, sql: string): Promise<{ code: string | null; message: string }> {
  await tx.$executeRawUnsafe("SAVEPOINT cert_probe");
  try {
    await tx.$queryRawUnsafe(sql);
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT cert_probe");
    return { code: null, message: "" };
  } catch (err) {
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT cert_probe");
    const meta = (err as { meta?: { code?: string; message?: string } }).meta;
    const message = meta?.message ?? (err instanceof Error ? err.message : String(err));
    const code = meta?.code ?? (message.match(/\b(42501)\b/)?.[1] ?? "UNKNOWN");
    return { code, message };
  }
}

async function scalar<T>(tx: Tx, sql: string): Promise<T> {
  const rows = await tx.$queryRawUnsafe<Array<{ v: T }>>(sql);
  return rows[0].v;
}

async function simulateSupabaseAndCertify(tx: Tx, dbName: string) {
  // ── Simulación del estado trustme-runtime ───────────────────────────
  await tx.$executeRawUnsafe(`CREATE ROLE anon NOLOGIN NOINHERIT`);
  await tx.$executeRawUnsafe(`CREATE ROLE authenticated NOLOGIN NOINHERIT`);
  await tx.$executeRawUnsafe(`CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS`);
  await tx.$executeRawUnsafe(`CREATE ROLE ${MIGRATOR} NOLOGIN NOSUPERUSER INHERIT`);
  await tx.$executeRawUnsafe(`CREATE ROLE ${UNMANAGED_OWNER} NOLOGIN NOSUPERUSER`);
  await tx.$executeRawUnsafe(`CREATE ROLE ${WEAK_MIGRATOR} NOLOGIN NOSUPERUSER`);
  await tx.$executeRawUnsafe(`CREATE ROLE ${LEGIT_READER} NOLOGIN NOSUPERUSER`);
  await tx.$executeRawUnsafe(`CREATE ROLE ${GRANTEE_ONLY} NOLOGIN NOSUPERUSER`);
  await tx.$executeRawUnsafe(`ALTER DATABASE "${dbName}" OWNER TO ${MIGRATOR}`);
  await tx.$executeRawUnsafe(`
    DO $$ DECLARE r record; BEGIN
      FOR r IN SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p','v','m') LOOP
        EXECUTE format('ALTER TABLE public.%I OWNER TO ${MIGRATOR}', r.relname);
      END LOOP;
      FOR r IN SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'S' LOOP
        EXECUTE format('ALTER SEQUENCE public.%I OWNER TO ${MIGRATOR}', r.relname);
      END LOOP;
    END $$`);
  await tx.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, ${MIGRATOR}`);
  await tx.$executeRawUnsafe(`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role`);
  await tx.$executeRawUnsafe(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role`);
  for (const owner of [MIGRATOR, UNMANAGED_OWNER]) {
    for (const kind of ["TABLES", "SEQUENCES", "FUNCTIONS"]) {
      await tx.$executeRawUnsafe(
        `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT ALL ON ${kind} TO anon, authenticated, service_role`,
      );
    }
  }
  // Objeto de un owner no administrable por el migrador (como supabase_admin).
  await tx.$executeRawUnsafe(`GRANT CREATE ON SCHEMA public TO ${UNMANAGED_OWNER}`);
  await tx.$executeRawUnsafe(`SET ROLE ${UNMANAGED_OWNER}`);
  await tx.$executeRawUnsafe(`CREATE TABLE public.zz_cert_platform_table (id int)`);
  await tx.$executeRawUnsafe(`RESET ROLE`);
  await tx.$executeRawUnsafe(`REVOKE CREATE ON SCHEMA public FROM ${UNMANAGED_OWNER}`);
  // Función de aplicación existente con EXECUTE a anon.
  await tx.$executeRawUnsafe(`SET ROLE ${MIGRATOR}`);
  await tx.$executeRawUnsafe(`CREATE FUNCTION public.zz_cert_fn() RETURNS int LANGUAGE sql AS 'SELECT 1'`);
  // Tabla con grant SOLO por columna a anon (sin grant de tabla).
  await tx.$executeRawUnsafe(`CREATE TABLE public.zz_cert_colonly (id int, secret text)`);
  await tx.$executeRawUnsafe(`REVOKE ALL ON public.zz_cert_colonly FROM anon, authenticated`);
  await tx.$executeRawUnsafe(`GRANT SELECT (id) ON public.zz_cert_colonly TO anon`);
  // Rol legítimo que lee una tabla y hoy depende de PUBLIC para USAGE del schema.
  await tx.$executeRawUnsafe(`GRANT SELECT ON public.products TO ${LEGIT_READER}`);
  await tx.$executeRawUnsafe(`RESET ROLE`);

  // TEST 11 en savepoint propio (estado tipo Control Plane), antes de la simulación trustme.
  await certifyControlPlaneLikeNoop(tx);

  // ── Estado previo: la vulnerabilidad está reproducida ──────────────
  await tx.$executeRawUnsafe(`SET ROLE ${MIGRATOR}`);
  const before = await auditSupabasePublicApiSecurity(tx);
  await tx.$executeRawUnsafe(`RESET ROLE`);
  check(
    "PRE  simulación reproduce trustme (audit FAIL)",
    before.status === "FAIL" && before.summary.tablesAccessibleByAnon > 0 &&
      before.summary.dangerousDefaultAcls === 3 && before.summary.unmanagedDefaultAcls === 3,
    `anon tablas=${before.summary.tablesAccessibleByAnon}, defaults peligrosos=${before.summary.dangerousDefaultAcls}, no administrables=${before.summary.unmanagedDefaultAcls}`,
  );
  await tx.$executeRawUnsafe(`SET ROLE anon`);
  const anonBefore = await sqlState(tx, `SELECT count(*) FROM public.products`);
  await tx.$executeRawUnsafe(`RESET ROLE`);
  check("PRE  anon puede leer public.products antes del hardening", anonBefore.code === null);

  // ── TEST 9: fail-closed — migrador sin privilegios aborta sin cambios ─
  await tx.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${WEAK_MIGRATOR}`);
  await tx.$executeRawUnsafe(`SET ROLE ${WEAK_MIGRATOR}`);
  const weakRun = await sqlState(tx, MIGRATION_SQL);
  await tx.$executeRawUnsafe(`RESET ROLE`);
  await tx.$executeRawUnsafe(`REVOKE USAGE ON SCHEMA public FROM ${WEAK_MIGRATOR}`);
  await tx.$executeRawUnsafe(`SET ROLE ${MIGRATOR}`);
  const afterWeak = await auditSupabasePublicApiSecurity(tx);
  await tx.$executeRawUnsafe(`RESET ROLE`);
  check(
    "TEST 9  migrador sin privilegios → EXCEPTION y cero cambios parciales (atómico)",
    weakRun.code !== null && /supabase-public-api-hardening/.test(weakRun.message) &&
      JSON.stringify(afterWeak.summary) === JSON.stringify(before.summary),
    `sqlstate=${weakRun.code}`,
  );

  // Artefacto de rollback generado ANTES del hardening (como en producción).
  await tx.$executeRawUnsafe(`SET ROLE ${MIGRATOR}`);
  const restoreSql = await generateSupabaseApiAclRestoreSql(tx);
  await tx.$executeRawUnsafe(`RESET ROLE`);
  const fingerprintBefore = await scalar<string>(tx, ACL_FINGERPRINT_SQL);

  // ── Aplicar la migración real como migrador NO superusuario (x2) ───
  await tx.$executeRawUnsafe(`SET ROLE ${MIGRATOR}`);
  await tx.$executeRawUnsafe(MIGRATION_SQL);
  const afterFirst = await auditSupabasePublicApiSecurity(tx);
  await tx.$executeRawUnsafe(MIGRATION_SQL);
  const afterSecond = await auditSupabasePublicApiSecurity(tx);
  await tx.$executeRawUnsafe(`RESET ROLE`);
  check(
    "TEST 7  migración idempotente (2 ejecuciones, mismo resultado PASS)",
    afterFirst.status === "PASS" && afterSecond.status === "PASS" &&
      afterSecond.summary.unmanagedDefaultAcls === 3 &&
      JSON.stringify(afterFirst.summary) === JSON.stringify(afterSecond.summary),
    `audit=${afterSecond.status}, unmanaged(INFO)=${afterSecond.summary.unmanagedDefaultAcls}`,
  );

  // ── TEST 12: grant solo por columna revocado ───────────────────────
  const colGrants = await scalar<bigint>(tx, `
    SELECT count(*) AS v FROM pg_attribute att CROSS JOIN LATERAL aclexplode(att.attacl) a
     WHERE att.attrelid = 'public.zz_cert_colonly'::regclass AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole)`);
  check("TEST 12 grant solo por columna a anon revocado", Number(colGrants) === 0, `column grants restantes=${colGrants}`);

  // ── TEST 13: rol legítimo que dependía de PUBLIC conserva acceso ───
  await tx.$executeRawUnsafe(`SET ROLE ${LEGIT_READER}`);
  const legitRead = await sqlState(tx, `SELECT count(*) FROM public.products`);
  await tx.$executeRawUnsafe(`RESET ROLE`);
  const legitExplicit = await scalar<boolean>(tx, `
    SELECT EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
                    WHERE n.nspname = 'public' AND a.grantee = '${LEGIT_READER}'::regrole AND a.privilege_type = 'USAGE') AS v`);
  check(
    "TEST 13 rol legítimo que dependía de PUBLIC conserva USAGE explícito y lectura",
    legitRead.code === null && legitExplicit,
    `SELECT → ${legitRead.code ?? "OK"}, USAGE explícito=${legitExplicit}`,
  );

  // ── TEST 1 / 2: SET ROLE anon|authenticated → rechazado ────────────
  for (const [n, role] of [[1, "anon"], [2, "authenticated"]] as const) {
    await tx.$executeRawUnsafe(`SET ROLE ${role}`);
    const probes = {
      select:   await sqlState(tx, `SELECT count(*) FROM public.products`),
      insert:   await sqlState(tx, `INSERT INTO public.platform_verticals (id, code, name, updated_at) VALUES ('x','X','x',now())`),
      update:   await sqlState(tx, `UPDATE public.products SET name = name`),
      delete:   await sqlState(tx, `DELETE FROM public.products`),
      fn:       await sqlState(tx, `SELECT public.zz_cert_fn()`),
      unmanaged:await sqlState(tx, `SELECT count(*) FROM public.zz_cert_platform_table`),
    };
    await tx.$executeRawUnsafe(`RESET ROLE`);
    // 42501 a nivel de schema (no de tabla); mensaje según locale del servidor.
    const allDenied = Object.values(probes).every((p) => p.code === "42501" && /(schema|esquema) public/.test(p.message));
    check(
      `TEST ${n}  SET ROLE ${role} → permission denied for schema public (SELECT/INSERT/UPDATE/DELETE/RPC)`,
      allDenied,
      allDenied ? "" : JSON.stringify(probes),
    );
  }

  // ── TEST 3 / 4: sin privilegios de tabla sobre tablas de aplicación ─
  for (const [n, role] of [[3, "anon"], [4, "authenticated"]] as const) {
    const privs = TABLE_PRIVILEGES.map((p) => `has_table_privilege('${role}', c.oid, '${p}')`).join(" OR ");
    const exposed = await scalar<bigint>(
      tx,
      `SELECT count(*) AS v FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p') AND c.relowner = '${MIGRATOR}'::regrole AND (${privs})`,
    );
    check(`TEST ${n}  ${role} sin ${TABLE_PRIVILEGES.join("/")} en tablas de aplicación`, Number(exposed) === 0, `tablas con privilegio=${exposed}`);
  }

  // ── TEST 5: objetos FUTUROS creados por el migrador ────────────────
  await tx.$executeRawUnsafe(`SET ROLE ${MIGRATOR}`);
  await tx.$executeRawUnsafe(`CREATE TABLE public.zz_cert_future (id serial PRIMARY KEY, v text)`);
  await tx.$executeRawUnsafe(`CREATE FUNCTION public.zz_cert_future_fn() RETURNS int LANGUAGE sql AS 'SELECT 2'`);
  await tx.$executeRawUnsafe(`RESET ROLE`);
  const futureApiAcl = await scalar<bigint>(tx, `
    SELECT count(*) AS v FROM (
      SELECT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
       WHERE c.oid IN ('public.zz_cert_future'::regclass, 'public.zz_cert_future_id_seq'::regclass)
      UNION ALL
      SELECT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
       WHERE p.oid = 'public.zz_cert_future_fn()'::regprocedure
    ) g WHERE g.grantee IN ('anon'::regrole, 'authenticated'::regrole)`);
  await tx.$executeRawUnsafe(`SET ROLE anon`);
  const futureProbe = await sqlState(tx, `SELECT count(*) FROM public.zz_cert_future`);
  await tx.$executeRawUnsafe(`RESET ROLE`);
  check(
    "TEST 5  tabla/secuencia/función futuras sin grants a anon/authenticated y no alcanzables",
    Number(futureApiAcl) === 0 && futureProbe.code === "42501",
    `ACL api=${futureApiAcl}, anon SELECT → ${futureProbe.code}`,
  );

  // ── TEST 6: Prisma (conexión de la app = migrador) conserva CRUD ───
  await tx.$executeRawUnsafe(`SET ROLE ${MIGRATOR}`);
  const code = `ZZ_CERT_${Date.now()}`;
  const created = await tx.platformVertical.create({ data: { code, name: "cert" } });
  const read = await tx.platformVertical.findUnique({ where: { id: created.id } });
  const updated = await tx.platformVertical.update({ where: { id: created.id }, data: { name: "cert-2" } });
  await tx.platformVertical.delete({ where: { id: created.id } });
  const gone = await tx.platformVertical.findUnique({ where: { id: created.id } });
  const productsReadable = await tx.product.count();
  await tx.$executeRawUnsafe(`RESET ROLE`);
  check(
    "TEST 6  Prisma (migrador/app, no superusuario) conserva SELECT/INSERT/UPDATE/DELETE",
    read?.code === code && updated.name === "cert-2" && gone === null && productsReadable >= 0,
  );

  // ── Alcance: service_role intacto, PUBLIC sin USAGE, migrador con USAGE ─
  const scope = (await tx.$queryRawUnsafe<Array<Record<string, boolean>>>(`
    SELECT has_schema_privilege('service_role', 'public', 'USAGE') AS sr_usage,
           has_table_privilege('service_role', 'public.products', 'SELECT') AS sr_select,
           has_schema_privilege('${MIGRATOR}', 'public', 'USAGE') AS migrator_usage,
           EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
                    WHERE n.nspname = 'public' AND a.grantee = 0) AS public_pseudo_acl`))[0];
  check(
    "SCOPE  service_role sin cambios, PUBLIC sin USAGE, migrador conserva USAGE",
    scope.sr_usage && scope.sr_select && scope.migrator_usage && !scope.public_pseudo_acl,
    JSON.stringify(scope),
  );

  // ── TEST 10: el artefacto de rollback restaura exactamente el ACL previo ─
  // (sin los objetos zz_cert_future*, que no existían al generarlo).
  await tx.$executeRawUnsafe(`DROP TABLE public.zz_cert_future`);
  await tx.$executeRawUnsafe(`DROP FUNCTION public.zz_cert_future_fn()`);
  await tx.$executeRawUnsafe(`SET ROLE ${MIGRATOR}`);
  for (const stmt of restoreSql) await tx.$executeRawUnsafe(stmt);
  const restored = await auditSupabasePublicApiSecurity(tx);
  const restoredAgain = await generateSupabaseApiAclRestoreSql(tx);
  await tx.$executeRawUnsafe(`RESET ROLE`);
  // Los USAGE explícitos que concede el paso 1 (preservación: el lector
  // legítimo de TEST 13 y el owner no administrable, que dependían de PUBLIC)
  // son aditivos y no forman parte del rollback. En trustme el paso 1 no
  // preserva ningún rol (plan read-only), así que allí el rollback es exacto.
  await tx.$executeRawUnsafe(`REVOKE USAGE ON SCHEMA public FROM ${LEGIT_READER}, ${UNMANAGED_OWNER}`);
  const fingerprintAfter = await scalar<string>(tx, ACL_FINGERPRINT_SQL);
  check(
    "TEST 10 rollback dirigido restaura el ACL previo exacto, incluido grantor (no GRANT ALL genérico)",
    fingerprintAfter === fingerprintBefore &&
      JSON.stringify(restored.summary) === JSON.stringify(before.summary) &&
      JSON.stringify(restoredAgain) === JSON.stringify(restoreSql),
    `${restoreSql.length} sentencias, huella ACL ${fingerprintAfter === fingerprintBefore ? "idéntica" : "DISTINTA"}` +
      fingerprintDiff(fingerprintBefore, fingerprintAfter),
  );

  throw new RollbackSentinel();
}

async function main() {
  const baseUrl = new URL(process.env.DATABASE_URL ?? "");
  assertLocal(baseUrl);

  const admin = new PrismaClient();
  const dbName = `zolvi_sec_cert_${Date.now()}`;
  const scratchUrl = new URL(baseUrl.toString());
  scratchUrl.pathname = `/${dbName}`;
  let created = false;

  try {
    const who = (await admin.$queryRawUnsafe<Array<{ su: boolean; existing: string | null }>>(`
      SELECT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS su,
             (SELECT string_agg(rolname, ',') FROM pg_roles WHERE rolname = ANY ($1::text[])) AS existing`,
      TRANSIENT_ROLES))[0];
    if (!who.su) throw new Error("El usuario local debe ser superusuario para la certificación.");
    if (who.existing) throw new Error(`Roles ya existentes en el cluster local (${who.existing}); abortando para no interferir.`);

    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    created = true;
    console.log(`Base desechable: ${dbName}`);

    // ── Fase A: migrate deploy completo sin roles Supabase (TEST 8) ───
    // Mismo patrón que run-runtime-migrations-runner.ts: comando fijo, sin shell:true.
    const env = { ...process.env, DATABASE_URL: scratchUrl.toString(), DIRECT_URL: scratchUrl.toString() };
    const deploy = process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", "npx prisma migrate deploy --schema prisma/schema.prisma"], { encoding: "utf8", shell: false, env })
      : spawnSync("npx", ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"], { encoding: "utf8", shell: false, env });
    const scratch = new PrismaClient({ datasources: { db: { url: scratchUrl.toString() } } });
    try {
      const applied = await scratch.$queryRawUnsafe<Array<{ ok: boolean }>>(
        `SELECT finished_at IS NOT NULL AND rolled_back_at IS NULL AS ok FROM _prisma_migrations WHERE migration_name = $1`,
        MIGRATION_NAME,
      );
      const acl = await scratch.$queryRawUnsafe<Array<{ acl: string }>>(
        `SELECT nspacl::text AS acl FROM pg_namespace WHERE nspname = 'public'`,
      );
      const localAudit = await auditSupabasePublicApiSecurity(scratch);
      check(
        "TEST 8  prisma migrate deploy completo en PostgreSQL local sin roles Supabase",
        deploy.status === 0 && applied[0]?.ok === true,
        `exit=${deploy.status}${deploy.status !== 0 ? ` ${sanitizeDatabaseError(deploy.stderr || deploy.stdout)}` : ""}`,
      );
      check(
        "TEST 8b local: ACL de public sin cambios y audit NOT_APPLICABLE",
        acl[0]?.acl === "{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner}" && localAudit.status === "NOT_APPLICABLE",
        `acl=${acl[0]?.acl}, audit=${localAudit.status}`,
      );

      // ── Fase B: simulación Supabase dentro de una transacción ROLLBACK ─
      try {
        await scratch.$transaction((tx) => simulateSupabaseAndCertify(tx, dbName), { timeout: 300_000, maxWait: 30_000 });
      } catch (err) {
        if (!(err instanceof RollbackSentinel)) throw err;
      }
    } finally {
      await scratch.$disconnect();
    }

    // ── Fase C: sin residuos ─────────────────────────────────────────
    const leftovers = (await admin.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM pg_roles WHERE rolname = ANY ($1::text[])`,
      TRANSIENT_ROLES,
    ))[0].n;
    check("CLEANUP roles transitorios revertidos (ROLLBACK)", Number(leftovers) === 0, `roles restantes=${leftovers}`);
  } finally {
    if (created) {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      console.log(`Base desechable eliminada: ${dbName}`);
    }
    await admin.$disconnect();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nRESULT=${failed.length === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length})`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(`ERROR: ${sanitizeDatabaseError(err)}`);
  process.exitCode = 2;
});
