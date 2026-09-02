/**
 * run-runtime-migrations-runner.ts
 *
 * RUN_MIGRATIONS — runner controlado para revisar y, solo con aprobación
 * explícita, aplicar migraciones Prisma sobre una runtime DB registrada
 * en `PlatformDatabaseProfile`. Bloqueante documentado en
 * docs/modules/platform-phase-7-multiclient-provisioning.md §12.2:
 * SEED_TENANT_BASE necesita el schema ya migrado antes de poder correr
 * (ver RUNTIME_NOT_MIGRATED_MESSAGE en seed-tenant-base-runner.ts) — este
 * runner es el paso previo.
 *
 * Nunca usa `prisma db push`, `prisma migrate dev` ni `prisma migrate
 * reset` contra una runtime DB — únicamente `prisma migrate status`
 * (solo lectura) y, en EXECUTE, `prisma migrate deploy` (el único comando
 * de Prisma CLI diseñado para bases ya existentes/productivas: no genera
 * migraciones nuevas, no hace drift-reset, no ejecuta seeds).
 *
 * ── Auditoría de migraciones actuales (previa a este bloque) ─────────
 * - `package.json`: "db:migrate" → `prisma migrate dev` (desarrollo local,
 *   NUNCA usar contra runtime), "db:migrate:prod" → `prisma migrate
 *   deploy` (mismo comando que este runner invoca, pero hoy solo corre
 *   contra `DATABASE_URL`/`DIRECT_URL` del proceso — es decir, control
 *   plane o la base local del desarrollador — nunca contra un
 *   `PlatformDatabaseProfile` runtime).
 * - `prisma/schema.prisma`: un solo datasource, `url = env("DATABASE_URL")`,
 *   `directUrl = env("DIRECT_URL")` — mismo schema se usa para control
 *   plane y para cada runtime DB (ver runtime-database-router.ts), solo
 *   cambia la URL de conexión en tiempo de ejecución.
 * - `prisma/migrations/`: 48 migraciones versionadas al momento de este
 *   bloque — ninguna se toca ni se genera aquí.
 * - No existía ningún script/action que corriera `migrate status` o
 *   `migrate deploy` contra un perfil runtime — confirmado por búsqueda
 *   (`child_process`/`execSync`/`spawnSync`) sin resultados previos en
 *   `prisma/scripts` ni `src/modules/platform`. Este archivo es el primer
 *   uso de `child_process` en el repo — deliberado, documentado aquí.
 * - `platform-manual-deployment-checklist.tsx` ya documentaba el paso
 *   manual: "Ejecutar `npx prisma migrate deploy` contra la base de datos
 *   destino" — este runner automatiza ESE paso exacto, con D0 y auditoría,
 *   sin cambiar el comando real que se ejecuta.
 *
 * ── Cómo se construye la URL runtime sin imprimir secretos ────────────
 * Reutiliza `buildDatabaseUrlFromProfile` (database-profile-url.ts) — la
 * misma pieza que usa el Runtime Database Router. La URL con password en
 * plano SOLO vive en memoria, dentro del `env` que se pasa al proceso
 * hijo (`spawnSync`); nunca se imprime, nunca se escribe a disco, nunca
 * se agrega a `.env`. Todo log de este runner usa `describeProfileSafely`
 * (host/puerto/db/usuario enmascarado/ssl_mode) o `sanitizeDatabaseError`
 * sobre cualquier stdout/stderr capturado del hijo, por si Prisma llegara
 * a imprimir la URL en un mensaje de error.
 *
 * ── Supabase pooler (6543) vs conexión directa (5432) ─────────────────
 * `buildDatabaseUrlFromProfile` ya sabe detectar el Transaction Pooler de
 * Supabase (puerto 6543) y agregarle `pgbouncer=true&connection_limit=1`
 * — necesario para queries normales de la app, pero **`prisma migrate
 * deploy`/`migrate status` usan advisory locks de Postgres que NO
 * funcionan de forma confiable a través de un pooler en modo
 * transacción** (documentado por Prisma: requieren conexión directa).
 *
 * ACTUALIZACIÓN (bloque "direct connection"): `PlatformDatabaseProfile`
 * ahora soporta una conexión directa opcional (`direct_db_host`,
 * `direct_db_port`, `direct_db_name`, `direct_db_user`,
 * `direct_encrypted_password`, `direct_ssl_mode` — ver schema.prisma y
 * database-profile-url.ts). Prioridad de resolución en
 * `resolveMigrationUrl()`:
 *   1. Si el perfil tiene conexión directa configurada
 *      (`hasDirectConnectionConfigured`), STATUS/DEPLOY SIEMPRE la usan
 *      — sin importar el puerto de la conexión normal (app/runtime). Si
 *      la conexión directa configurada también fuera puerto 6543, eso
 *      es un error de configuración del operador y se reporta como
 *      brecha (nunca cae de vuelta a la conexión normal en silencio).
 *   2. Si NO hay conexión directa configurada y la conexión normal usa
 *      el Transaction Pooler (`db_port === 6543`), persiste la brecha
 *      original: este runner se detiene y pide configurar la sección
 *      "Conexión directa para migraciones" del perfil en Platform Admin
 *      — no inventa una URL directa a partir del host del pooler.
 *   3. Si NO hay conexión directa configurada y la conexión normal NO es
 *      pooler, se usa la normal (mismo comportamiento que antes de este
 *      bloque).
 * La conexión directa es EXCLUSIVA de este runner: la app y el Runtime
 * Database Router nunca leen `direct_*` — siguen usando siempre la
 * conexión normal, sin cambio de comportamiento.
 *
 * ── Pasos (--step) ───────────────────────────────────────────────────
 *   INSPECT — solo lectura, sin ejecutar Prisma CLI. Resuelve org/perfil,
 *             muestra resumen seguro, confirma si puede construirse una
 *             URL de migración segura o si hay brecha de pooler.
 *   STATUS  — equivalente seguro de `npx prisma migrate status` contra la
 *             runtime DB. Solo lectura para la runtime DB. No escribe en
 *             runtime. No genera PlatformDeploymentLog (nunca escribe).
 *   DEPLOY  — (default) DRY_RUN (default) reutiliza STATUS y muestra el
 *             plan (comando que se ejecutaría, target seguro, D0 preview).
 *             EXECUTE corre `prisma migrate deploy` real — PREPARADO,
 *             NO EJECUTADO EN ESTE BLOQUE.
 *
 * ── D0 — SEED_TENANT_BASE que puede aprender del gate (RUN_MIGRATIONS) ─
 * `ACTION_EXECUTION_RISK.RUN_MIGRATIONS = "HIGH"` (ya definido en
 * database-execution-safety.ts, sin cambios). Matriz ya vigente:
 *   LOCAL/SANDBOX/TEST + HIGH → CONFIRMATION_REQUIRED (dry-run previo +
 *     backup confirmado + confirmación textual + test de conexión
 *     SUCCESS, todo exigido por evaluateDatabaseExecutionSafety).
 *   STAGING + HIGH  → BLOCKED (matriz existente, sin cambios).
 *   PRODUCTION + HIGH → BLOCKED (matriz existente, sin cambios).
 * No hizo falta agregar ninguna regla nueva a la matriz D0 — ya bloquea
 * STAGING y PRODUCTION para riesgo HIGH. Este runner además agrega un
 * hard-block explícito ANTES de D0 para STAGING/PRODUCTION (mismo
 * criterio que run-database-profile-tenant-fiscal-config.action.ts con
 * PRODUCTION), solo para dar un mensaje más claro — D0 igual lo hubiera
 * bloqueado.
 *
 * ── Variables de entorno ───────────────────────────────────────────────
 * Ninguna nueva. No usa SEED_TENANT_ADMIN_PASSWORD ni ninguna variable de
 * secretos propia — todo el secreto (password de la runtime DB) viene
 * cifrado desde PlatformDatabaseProfile.encrypted_password.
 *
 * ── USO (PowerShell) ────────────────────────────────────────────────────
 *
 *   # 1. INSPECT — solo lectura, contra TrustMe
 *   npx tsx prisma/scripts/run-runtime-migrations-runner.ts `
 *     --org "TRUSTME-0001" --step INSPECT
 *
 *   # 2. STATUS — solo lectura, contra TrustMe (equivalente a migrate status)
 *   npx tsx prisma/scripts/run-runtime-migrations-runner.ts `
 *     --org "TRUSTME-0001" --step STATUS
 *
 *   # 3. DEPLOY DRY_RUN — perfil de cliente ficticio, no ejecuta nada
 *   npx tsx prisma/scripts/run-runtime-migrations-runner.ts `
 *     --org "DEMO-CLIENTE-0001" --step DEPLOY --mode DRY_RUN
 *
 *   # 4. DEPLOY EXECUTE — preparado, NO EJECUTAR SIN APROBACIÓN EXPLÍCITA
 *   npx tsx prisma/scripts/run-runtime-migrations-runner.ts `
 *     --org "DEMO-CLIENTE-0001" --step DEPLOY --mode EXECUTE `
 *     --confirm "RUN MIGRATIONS" --backup-confirmed
 *
 * --profile <profileId>  — opcional, igual que seed-tenant-base-runner.ts.
 * --backup-confirmed     — requerido en DEPLOY EXECUTE (D0 exige backup
 *                           confirmado siempre para riesgo HIGH, sin
 *                           importar el ambiente).
 * --actor <userId>       — opcional, triggered_by en PlatformDeploymentLog.
 *
 * ESTE SCRIPT NO USA `db push`. NO USA `migrate dev` contra runtime. NO
 * USA `migrate reset`. NO EJECUTA SEEDS. NO TOCA DTE/MH/firmador/MariaDB.
 * NO MODIFICA `.env`. NO CREA BASES NI ORGANIZACIONES NI TENANT/LOCATION/
 * ADMIN (eso es SEED_TENANT_BASE, que corre DESPUÉS de este runner).
 *
 * Este script NO fue ejecutado en --step DEPLOY --mode EXECUTE. Preparado
 * y validado (tsc/eslint), en espera de aprobación explícita.
 */

import "dotenv/config";
import { spawnSync } from "child_process";
import path from "path";
import type { Prisma } from "@prisma/client";

import { controlPlanePrisma } from "../../src/modules/platform/runtime/control-plane-prisma";
import { assertEncryptionAvailable } from "../../src/lib/security/encryption";
import {
  buildDatabaseUrlFromProfile,
  sanitizeDatabaseError,
  hasDirectConnectionConfigured,
  toDirectConnectionFields,
} from "../../src/modules/platform/lib/database-profile-url";
import { evaluateDatabaseExecutionSafety } from "../../src/modules/platform/lib/database-execution-safety";
import type {
  DatabaseExecutionSafetyInput,
  PlatformDatabaseProfileEnvironment,
} from "../../src/modules/platform/types/platform.types";

// ─────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────

type Step = "INSPECT" | "STATUS" | "DEPLOY";
type Mode = "DRY_RUN" | "EXECUTE";

const CONFIRMATION_TEXT = "RUN MIGRATIONS";

const ENVIRONMENT_PRIORITY: Record<string, number> = {
  PRODUCTION: 0,
  STAGING: 1,
  SANDBOX: 2,
  TEST: 3,
  LOCAL: 4,
};

// Puerto de Transaction Pooler de Supabase — ver header de este archivo.
const TRANSACTION_POOLER_PORT = 6543;

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function flagPresent(flag: string): boolean {
  return process.argv.includes(flag);
}

const ORG_QUERY        = argValue("--org");
const PROFILE_ID       = argValue("--profile");
const STEP             = (argValue("--step") ?? "STATUS").toUpperCase() as Step;
const MODE             = (argValue("--mode") ?? "DRY_RUN").toUpperCase() as Mode;
const CONFIRM          = argValue("--confirm");
const BACKUP_CONFIRMED = flagPresent("--backup-confirmed");
const ACTOR_ID         = argValue("--actor");

const VALID_STEPS: Step[] = ["INSPECT", "STATUS", "DEPLOY"];

class RunnerInputError extends Error {}

// ─────────────────────────────────────────────────────────────────
// Resolución de organización + perfil — mismo criterio que
// seed-tenant-base-runner.ts (sin exigir tenant_id: este runner no
// necesita el tenant en absoluto, solo el perfil de conexión).
// ─────────────────────────────────────────────────────────────────

interface ResolvedProfile {
  id: string;
  label: string;
  environment: string;
  provider: string;
  db_host: string;
  db_port: number | null;
  db_name: string;
  db_user: string;
  encrypted_password: string;
  ssl_mode: string;
  last_test_status: string;
  // Conexión directa opcional para migraciones — ver
  // database-profile-url.ts (hasDirectConnectionConfigured /
  // toDirectConnectionFields) y el schema.prisma (direct_* en
  // PlatformDatabaseProfile). Nunca la usa la app ni el Runtime
  // Database Router — solo este runner.
  direct_db_host: string | null;
  direct_db_port: number | null;
  direct_db_name: string | null;
  direct_db_user: string | null;
  direct_encrypted_password: string | null;
  direct_ssl_mode: string | null;
}

const PROFILE_SELECT = {
  id: true, label: true, environment: true, provider: true,
  db_host: true, db_port: true, db_name: true, db_user: true,
  encrypted_password: true, ssl_mode: true, last_test_status: true,
  organization_id: true, is_active: true,
  direct_db_host: true, direct_db_port: true, direct_db_name: true,
  direct_db_user: true, direct_encrypted_password: true, direct_ssl_mode: true,
} as const;

async function resolveOrganization(orgQuery: string) {
  const organization = await controlPlanePrisma.platformOrganization.findFirst({
    where: {
      OR: [
        { name: { contains: orgQuery, mode: "insensitive" } },
        { code: { contains: orgQuery, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, code: true },
  });
  if (!organization) {
    throw new RunnerInputError(`Organización no encontrada: "${orgQuery}"`);
  }
  return organization;
}

async function resolveActiveProfile(
  organizationId: string,
  explicitProfileId: string | undefined,
): Promise<ResolvedProfile> {
  if (explicitProfileId) {
    const profile = await controlPlanePrisma.platformDatabaseProfile.findUnique({
      where: { id: explicitProfileId },
      select: PROFILE_SELECT,
    });
    if (!profile) throw new RunnerInputError(`--profile "${explicitProfileId}" no existe.`);
    if (profile.organization_id !== organizationId) {
      throw new RunnerInputError(`--profile "${explicitProfileId}" no pertenece a la organización resuelta.`);
    }
    if (!profile.is_active) {
      throw new RunnerInputError(`--profile "${explicitProfileId}" no está activo (is_active=false).`);
    }
    return profile;
  }

  const candidates = await controlPlanePrisma.platformDatabaseProfile.findMany({
    where: { organization_id: organizationId, is_active: true },
    select: PROFILE_SELECT,
  });
  if (candidates.length === 0) {
    throw new RunnerInputError("No hay ningún PlatformDatabaseProfile activo para esta organización.");
  }
  if (candidates.length > 1) {
    const [chosen] = [...candidates].sort(
      (a, b) => (ENVIRONMENT_PRIORITY[a.environment] ?? 99) - (ENVIRONMENT_PRIORITY[b.environment] ?? 99),
    );
    console.log(
      `[perfil] Hay ${candidates.length} perfiles activos — se eligió "${chosen.label}" ` +
      `(${chosen.environment}) por prioridad de ambiente. Usa --profile para forzar otro.`,
    );
    return chosen;
  }
  return candidates[0];
}

// ─────────────────────────────────────────────────────────────────
// Presentación segura — nunca expone password ni URL completa
// ─────────────────────────────────────────────────────────────────

function maskUser(user: string): string {
  if (user.length <= 2) return "*".repeat(user.length);
  return `${user.slice(0, 2)}${"*".repeat(Math.max(user.length - 2, 3))}`;
}

function describeProfileSafely(profile: ResolvedProfile): string[] {
  const lines = [
    `label:             ${profile.label}`,
    `environment:       ${profile.environment}`,
    `provider:          ${profile.provider}`,
    `db_host:           ${profile.db_host}`,
    `db_port:           ${profile.db_port ?? 5432}`,
    `db_name:           ${profile.db_name}`,
    `db_user:           ${maskUser(profile.db_user)}`,
    `ssl_mode:          ${profile.ssl_mode}`,
    `last_test_status:  ${profile.last_test_status}`,
  ];
  if (hasDirectConnectionConfigured(profile)) {
    lines.push(
      "── conexión directa (migraciones) ──",
      `direct_db_host:    ${profile.direct_db_host}`,
      `direct_db_port:    ${profile.direct_db_port ?? 5432}`,
      `direct_db_name:    ${profile.direct_db_name}`,
      `direct_db_user:    ${maskUser(profile.direct_db_user ?? "")}`,
      `direct_ssl_mode:   ${profile.direct_ssl_mode ?? "PREFER"}`,
    );
  } else {
    lines.push("conexión directa (migraciones): NO configurada");
  }
  return lines;
}

// ─────────────────────────────────────────────────────────────────
// Brecha de pooler — ver header de este archivo
// ─────────────────────────────────────────────────────────────────

interface MigrationUrlResolution {
  ok: boolean;
  url?: string; // NUNCA loguear — solo pasar a env del proceso hijo
  gapReason?: string;
  usedDirectConnection?: boolean; // solo informativo, para los logs de STATUS/DEPLOY
}

/**
 * Resuelve la URL a usar para `migrate status`/`migrate deploy`:
 *   1. Si el perfil tiene conexión directa configurada (direct_db_host),
 *      SIEMPRE se usa esa — sin importar el puerto de la conexión normal.
 *      Si el operador configuró mal la conexión directa (ej. también
 *      puerto 6543), se reporta como brecha igual — no se cae de vuelta
 *      a la conexión normal (evita usar silenciosamente un pooler).
 *   2. Si no hay conexión directa y la normal usa el Transaction Pooler
 *      (6543), es la brecha original documentada — se detiene.
 *   3. Si no hay conexión directa y la normal no es pooler, se usa la
 *      normal (sin cambios respecto al bloque anterior).
 */
function resolveMigrationUrl(profile: ResolvedProfile): MigrationUrlResolution {
  if (hasDirectConnectionConfigured(profile)) {
    const directPort = profile.direct_db_port ?? 5432;
    if (directPort === TRANSACTION_POOLER_PORT) {
      return {
        ok: false,
        gapReason:
          `La conexión directa configurada también usa el puerto ${TRANSACTION_POOLER_PORT} ` +
          "(Transaction Pooler) — eso no es una conexión directa real. Corregir direct_db_port en " +
          "Platform Admin antes de continuar con STATUS/DEPLOY.",
      };
    }
    try {
      assertEncryptionAvailable();
      const url = buildDatabaseUrlFromProfile(toDirectConnectionFields(profile));
      return { ok: true, url, usedDirectConnection: true };
    } catch (err) {
      return { ok: false, gapReason: sanitizeDatabaseError(err) };
    }
  }

  const port = profile.db_port ?? 5432;
  if (port === TRANSACTION_POOLER_PORT) {
    return {
      ok: false,
      gapReason:
        `db_port=${TRANSACTION_POOLER_PORT} (Transaction Pooler) y este perfil no tiene conexión directa ` +
        "configurada. No es seguro asumir que el mismo host expone un puerto 5432 directo válido " +
        "(Supabase suele usar un host DISTINTO para la conexión directa). `prisma migrate status`/" +
        "`migrate deploy` necesitan advisory locks que no funcionan de forma confiable a través de un " +
        "pooler en modo transacción. Brecha real — no se inventa una URL. Configurar la sección " +
        "\"Conexión directa para migraciones\" de este perfil en Platform Admin antes de continuar " +
        "con STATUS/DEPLOY.",
    };
  }
  try {
    assertEncryptionAvailable();
    const url = buildDatabaseUrlFromProfile(profile);
    return { ok: true, url, usedDirectConnection: false };
  } catch (err) {
    return { ok: false, gapReason: sanitizeDatabaseError(err) };
  }
}

// ─────────────────────────────────────────────────────────────────
// Ejecución de Prisma CLI contra la runtime DB — env del proceso hijo
// únicamente, nunca toca process.env del padre ni .env en disco.
// ─────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "../..");

interface PrismaCliResult {
  code: number | null;
  signal: string | null;
  spawnError: string | null; // spawnSync-level error (ENOENT, EINVAL, etc.) — Prisma nunca llegó a correr
  stdout: string;
  stderr: string;
}

// sanitizeDatabaseError (database-profile-url.ts) trunca a 500 caracteres
// — pensado para mensajes de error cortos, no para la salida completa de
// `prisma migrate status`/`migrate deploy`, que el operador necesita ver
// entera para diagnosticar. Reutiliza exactamente las mismas reglas de
// redacción (connection strings, segmento user:password@host, password=
// en query strings) pero sin el corte a 500 — solo un tope generoso para
// evitar payloads absurdos.
function sanitizeCliOutput(raw: string): string {
  return raw
    .replace(/postgresql:\/\/[^\s"']*/gi, "[connection-string-redacted]")
    .replace(/postgres:\/\/[^\s"']*/gi,   "[connection-string-redacted]")
    .replace(/:[^@\s]{1,256}@/g, ":[redacted]@")
    .replace(/password=[^\s&"']*/gi, "password=[redacted]")
    .substring(0, 20000);
}

// Único conjunto de subcomandos que este runner puede invocar. Ningún
// input de usuario (--org, --profile, etc.) llega jamás a `args` — es
// siempre uno de estos dos arrays literales, pasados internamente por
// stepStatus/stepDeploy. Se valida en tiempo de ejecución igual (defensa
// en profundidad): si algún día un caller pasara otra cosa, se rechaza
// antes de construir ningún comando.
const ALLOWED_PRISMA_ARGS: readonly (readonly string[])[] = [
  ["migrate", "status"],
  ["migrate", "deploy"],
];

function assertAllowedPrismaArgs(args: string[]): void {
  const isAllowed = ALLOWED_PRISMA_ARGS.some(
    (allowed) => allowed.length === args.length && allowed.every((v, i) => v === args[i]),
  );
  if (!isAllowed) {
    throw new Error(
      `[runPrismaCli] Subcomando no permitido: ${JSON.stringify(args)}. ` +
      `Solo se permite 'migrate status' o 'migrate deploy'.`,
    );
  }
}

/**
 * Ejecuta Prisma CLI contra la runtime DB. Fail-closed por diseño:
 * NUNCA lanza por sí mismo el resultado de Prisma — devuelve siempre
 * code/signal/spawnError/stdout/stderr reales para que el caller decida,
 * pero el caller (stepStatus/stepDeploy) está obligado a tratar
 * spawnError, code!==0 o salida vacía como fallo explícito — nunca como
 * éxito silencioso. (Si lanza, es por `assertAllowedPrismaArgs` — un
 * error de programación interno, no un resultado de Prisma.)
 *
 * En Windows, `npx` es en realidad `npx.cmd` (un batch file, no un
 * ejecutable) — spawnSync no puede invocarlo directamente sin pasar por
 * el shell del SO (sin eso, Node reporta el fallo en `result.error`,
 * nunca lo lanza, y el proceso hijo NUNCA llega a correr: stdout/stderr
 * quedan vacíos con exit code null — el bug original de este bloque).
 *
 * La primera corrección usó `spawnSync(..., { shell: true })`, que sí
 * arregla el spawn pero dispara DEP0190 (Node concatena los args del
 * array en una sola línea de shell SIN escaparlos cuando `shell: true`).
 * Es seguro en este caso puntual porque `args` es siempre uno de los dos
 * arrays literales de `ALLOWED_PRISMA_ARGS` — ningún input de usuario se
 * concatena — pero para no depender de esa garantía y evitar el warning,
 * en Windows se invoca `cmd.exe /d /s /c "<comando fijo>"` con
 * `shell: false`: el comando es una única string construida SOLO a
 * partir de literales controlados (nunca `--org`/`--profile`/etc.), y
 * `cmd.exe` se llama directamente como ejecutable (no como shell de
 * spawnSync), así que no aplica el aviso de Node. En POSIX, `npx` es un
 * ejecutable real — se sigue invocando sin shell en absoluto.
 */
function runPrismaCli(args: string[], runtimeUrl: string): PrismaCliResult {
  assertAllowedPrismaArgs(args);

  const isWin = process.platform === "win32";
  const env = {
    ...process.env,
    DATABASE_URL: runtimeUrl,
    DIRECT_URL: runtimeUrl,
  };

  const child = isWin
    ? spawnSync(
        "cmd.exe",
        // Comando fijo — construido solo a partir de `args` (uno de los
        // dos arrays literales permitidos) y la ruta constante del
        // schema. Nunca interpola --org/--profile ni ningún otro input.
        ["/d", "/s", "/c", `npx prisma ${args.join(" ")} --schema prisma/schema.prisma`],
        { cwd: REPO_ROOT, encoding: "utf-8", shell: false, env },
      )
    : spawnSync(
        "npx",
        ["prisma", ...args, "--schema", "prisma/schema.prisma"],
        { cwd: REPO_ROOT, encoding: "utf-8", shell: false, env },
      );

  return {
    code:       child.status,
    signal:     child.signal ?? null,
    spawnError: child.error ? sanitizeDatabaseError(child.error) : null,
    stdout:     sanitizeCliOutput(child.stdout ?? ""),
    stderr:     sanitizeCliOutput(child.stderr ?? ""),
  };
}

// Heurística de lectura de `prisma migrate status` — Prisma no expone un
// JSON estructurado para este comando, solo texto. Se reporta también el
// stdout/stderr sanitizado completo para que el operador lo revise.
interface MigrateStatusReport {
  schemaMissingMigrationsTable: boolean;
  appearsUpToDate: boolean;
  hasPendingMigrations: boolean;
  driftOrErrorDetected: boolean;
}

function parseMigrateStatusOutput(result: PrismaCliResult): MigrateStatusReport {
  const combined = `${result.stdout}\n${result.stderr}`;
  return {
    schemaMissingMigrationsTable:
      /_prisma_migrations.{0,40}(does not exist|not exist|no existe)/i.test(combined) ||
      /no migration found/i.test(combined),
    appearsUpToDate: /up to date|Database schema is up to date/i.test(combined),
    hasPendingMigrations: /have not (yet )?been applied|not yet applied|following migration/i.test(combined),
    driftOrErrorDetected: /drift detected|error|P1\d{3}|P3\d{3}/i.test(combined) && result.code !== 0,
  };
}

// ─────────────────────────────────────────────────────────────────
// INSPECT
// ─────────────────────────────────────────────────────────────────

function stepInspect(profile: ResolvedProfile) {
  console.log("\n[INSPECT] Solo lectura. No se ejecuta Prisma CLI. No se escribe nada.\n");
  for (const line of describeProfileSafely(profile)) console.log(`[INSPECT] ${line}`);

  const isPoolerNormal = (profile.db_port ?? 5432) === TRANSACTION_POOLER_PORT;
  console.log(
    `\n[INSPECT] conexión directa configurada: ${hasDirectConnectionConfigured(profile) ? "SÍ" : "NO"}`,
  );
  console.log(`[INSPECT] conexión normal usa Transaction Pooler (6543): ${isPoolerNormal ? "SÍ" : "NO"}`);

  const resolution = resolveMigrationUrl(profile);
  if (resolution.ok) {
    console.log(
      `\n[INSPECT] STATUS/DEPLOY podrán ejecutarse usando la conexión ` +
      `${resolution.usedDirectConnection ? "DIRECTA" : "normal"} (URL no se imprime).`,
    );
  } else {
    console.log(`\n[INSPECT] ⚠ Brecha detectada — STATUS/DEPLOY quedarán BLOQUEADOS: ${resolution.gapReason}`);
  }
  console.log("\n[INSPECT] No se imprimió ningún secret. No se escribió nada.");
}

// ─────────────────────────────────────────────────────────────────
// STATUS
// ─────────────────────────────────────────────────────────────────

function stepStatus(profile: ResolvedProfile): MigrateStatusReport {
  console.log("\n[STATUS] Equivalente seguro de `npx prisma migrate status` — solo lectura.\n");
  for (const line of describeProfileSafely(profile)) console.log(`[STATUS] ${line}`);

  const resolution = resolveMigrationUrl(profile);
  if (!resolution.ok) {
    throw new RunnerInputError(`No se puede ejecutar STATUS: ${resolution.gapReason}`);
  }
  console.log(`\n[STATUS] Usando conexión ${resolution.usedDirectConnection ? "DIRECTA" : "normal"} para migrate status.`);

  const result = runPrismaCli(["migrate", "status"], resolution.url!);

  // ── Diagnóstico crudo, SIEMPRE mostrado antes de cualquier veredicto ──
  console.log(`\n[STATUS] exit code: ${result.code ?? "null (el proceso no terminó normalmente)"}`);
  console.log(`[STATUS] signal:    ${result.signal ?? "ninguna"}`);
  console.log(`[STATUS] spawn error: ${result.spawnError ?? "ninguno"}`);
  console.log("\n[STATUS] stdout (sanitizado):\n");
  console.log(result.stdout.trim() ? result.stdout : "(vacío)");
  console.log("\n[STATUS] stderr (sanitizado):\n");
  console.log(result.stderr.trim() ? result.stderr : "(vacío)");

  // ── Fail-closed: nunca declarar éxito sin evidencia real ──────────
  if (result.spawnError) {
    throw new RunnerInputError(
      `No se pudo ejecutar \`prisma migrate status\` — falló al lanzar el proceso: ${result.spawnError}`,
    );
  }
  if (!result.stdout.trim() && !result.stderr.trim()) {
    throw new RunnerInputError(
      "Prisma migrate status no produjo salida; no se puede concluir estado de migraciones.",
    );
  }
  if (result.code !== 0) {
    throw new RunnerInputError(
      `\`prisma migrate status\` terminó con código ${result.code ?? "null"}${result.signal ? ` (señal ${result.signal})` : ""}. ` +
      "Ver stdout/stderr completos arriba — puede indicar migraciones pendientes o un error real; revisar antes de continuar.",
    );
  }

  const report = parseMigrateStatusOutput(result);
  console.log("\n[STATUS] Resumen derivado (heurístico, revisar salida completa arriba):");
  console.log(`  falta tabla _prisma_migrations / DB no migrada: ${report.schemaMissingMigrationsTable}`);
  console.log(`  al día (sin pendientes):                        ${report.appearsUpToDate}`);
  console.log(`  migraciones pendientes detectadas:               ${report.hasPendingMigrations}`);
  console.log(`  drift/error detectado:                           ${report.driftOrErrorDetected}`);
  console.log("\n[STATUS] No se escribió en runtime. No se generó PlatformDeploymentLog (STATUS nunca escribe).");
  return report;
}

// ─────────────────────────────────────────────────────────────────
// DEPLOY
// ─────────────────────────────────────────────────────────────────

function buildSafetyInput(
  profile: ResolvedProfile,
  isDryRun: boolean,
  hasRecentSuccessfulDryRun: boolean,
): DatabaseExecutionSafetyInput {
  return {
    actionType: "RUN_MIGRATIONS",
    profileEnvironment: profile.environment as PlatformDatabaseProfileEnvironment,
    targetType: "CLIENT_RUNTIME",
    isDryRun,
    confirmationText: !isDryRun ? CONFIRM : undefined,
    expectedConfirmationText: !isDryRun ? CONFIRMATION_TEXT : undefined,
    hasRecentSuccessfulConnectionTest: profile.last_test_status === "SUCCESS",
    hasRecentPreflight: true, // STATUS ya corrió en esta misma invocación (ver stepDeploy)
    hasBackupConfirmation: BACKUP_CONFIRMED,
    hasRecentSuccessfulDryRun,
  };
}

async function stepDeploy(
  organization: { id: string; name: string; code: string },
  profile: ResolvedProfile,
) {
  // Hard-block explícito antes de D0 — mismo criterio que
  // run-database-profile-tenant-fiscal-config.action.ts con PRODUCTION.
  // D0 ya bloquea STAGING/PRODUCTION para riesgo HIGH (RUN_MIGRATIONS) —
  // esto solo da un mensaje más claro, no reemplaza la matriz.
  if (profile.environment === "PRODUCTION" || profile.environment === "STAGING") {
    throw new RunnerInputError(
      `RUN_MIGRATIONS está bloqueado en ambiente ${profile.environment} (D0: riesgo HIGH → BLOCKED en ` +
      "STAGING/PRODUCTION). No existe hoy una regla D0 explícita para permitirlo ahí — se documenta como " +
      "bloqueado, no se agrega ninguna excepción en este bloque.",
    );
  }

  // DEPLOY reutiliza STATUS íntegro — el "dry-run" de RUN_MIGRATIONS es,
  // en la práctica, exactamente el `migrate status` de arriba: muestra
  // qué se aplicaría sin aplicar nada.
  const statusReport = stepStatus(profile);

  console.log("\n[DEPLOY] Comando que se ejecutaría en EXECUTE: `npx prisma migrate deploy`");
  console.log(`[DEPLOY] Target: perfil "${profile.label}" (${profile.environment}) — org "${organization.name}" (${organization.code})`);

  if (MODE === "DRY_RUN") {
    const safetyPreview = buildSafetyInput(profile, /* isDryRun */ true, /* hasRecentSuccessfulDryRun */ false);
    const safety = evaluateDatabaseExecutionSafety(safetyPreview);
    console.log("\n[DEPLOY][DRY_RUN] Preview D0 (informativo — DRY_RUN nunca exige confirmación):");
    for (const m of safety.messages) console.log(`  [D0] ${m}`);
    for (const w of safety.warnings) console.log(`  [D0][warning] ${w}`);
    for (const b of safety.blockers) console.log(`  [D0][blocker-si-fuera-EXECUTE] ${b}`);
    console.log(
      statusReport.hasPendingMigrations
        ? "\n[DEPLOY][DRY_RUN] Hay migraciones pendientes según STATUS — EXECUTE las aplicaría."
        : "\n[DEPLOY][DRY_RUN] STATUS no detectó migraciones pendientes — EXECUTE probablemente no aplicaría nada.",
    );
    console.log("\n[DRY_RUN] NO se ejecutó `migrate deploy`. NO se escribió nada.");
    return;
  }

  // ── MODE EXECUTE ─────────────────────────────────────────────────
  if (statusReport.driftOrErrorDetected) {
    throw new RunnerInputError(
      "STATUS detectó drift o error antes de intentar DEPLOY. Abortando — revisar la salida de STATUS arriba.",
    );
  }

  const safetyInput = buildSafetyInput(profile, /* isDryRun */ false, /* hasRecentSuccessfulDryRun */ true);
  const safety = evaluateDatabaseExecutionSafety(safetyInput);
  for (const m of safety.messages) console.log(`[D0] ${m}`);
  for (const w of safety.warnings) console.log(`[D0][warning] ${w}`);
  if (!safety.allowed) {
    for (const b of safety.blockers) console.error(`[D0][blocker] ${b}`);
    throw new RunnerInputError(safety.blockers[0] ?? "Acción bloqueada por el safety gate (D0).");
  }

  if (profile.last_test_status !== "SUCCESS") {
    // Redundante con D0 (ya lo hubiera bloqueado), pero explícito por
    // requisito propio de este bloque.
    throw new RunnerInputError(
      `last_test_status="${profile.last_test_status}" — se exige SUCCESS para DEPLOY EXECUTE.`,
    );
  }

  const resolution = resolveMigrationUrl(profile);
  if (!resolution.ok) {
    throw new RunnerInputError(`No se puede ejecutar DEPLOY: ${resolution.gapReason}`);
  }
  console.log(`\n[DEPLOY][EXECUTE] Usando conexión ${resolution.usedDirectConnection ? "DIRECTA" : "normal"} para migrate deploy.`);

  console.log("\n[DEPLOY][EXECUTE] Ejecutando `npx prisma migrate deploy` contra la runtime DB...");
  const result = runPrismaCli(["migrate", "deploy"], resolution.url!);

  // ── Mismo diagnóstico fail-closed que STATUS — ver runPrismaCli/stepStatus ──
  console.log(`\n[DEPLOY][EXECUTE] exit code: ${result.code ?? "null (el proceso no terminó normalmente)"}`);
  console.log(`[DEPLOY][EXECUTE] signal:    ${result.signal ?? "ninguna"}`);
  console.log(`[DEPLOY][EXECUTE] spawn error: ${result.spawnError ?? "ninguno"}`);
  console.log("\n[DEPLOY][EXECUTE] stdout (sanitizado):\n");
  console.log(result.stdout.trim() ? result.stdout : "(vacío)");
  console.log("\n[DEPLOY][EXECUTE] stderr (sanitizado):\n");
  console.log(result.stderr.trim() ? result.stderr : "(vacío)");

  if (result.spawnError) {
    throw new RunnerInputError(
      `No se pudo ejecutar \`prisma migrate deploy\` — falló al lanzar el proceso: ${result.spawnError}`,
    );
  }
  if (!result.stdout.trim() && !result.stderr.trim()) {
    throw new RunnerInputError(
      "Prisma migrate deploy no produjo salida; no se puede confirmar qué se aplicó. Abortando sin dar por exitoso.",
    );
  }

  const appliedMatches = result.stdout.match(/Applying migration `[^`]+`/g) ?? [];

  if (result.code !== 0) {
    throw new RunnerInputError(
      `\`prisma migrate deploy\` terminó con código ${result.code ?? "null"}${result.signal ? ` (señal ${result.signal})` : ""}. ` +
      "Ver salida sanitizada arriba.",
    );
  }

  console.log(`\n✅ [DEPLOY][EXECUTE] migrate deploy OK. Migraciones aplicadas en esta corrida: ${appliedMatches.length}.`);

  await controlPlanePrisma.platformDeploymentLog.create({
    data: {
      organization_id: organization.id,
      action: "RUN_MIGRATIONS",
      status: "SUCCESS",
      notes: `DEPLOY EXECUTE — perfil: ${profile.label} (${profile.environment}) — aplicadas: ${appliedMatches.length}`,
      triggered_by: ACTOR_ID ?? null,
      metadata: {
        profileId: profile.id,
        profileLabel: profile.label,
        environment: profile.environment,
        appliedCount: appliedMatches.length,
        actorId: ACTOR_ID ?? null,
      } as Prisma.InputJsonObject,
    },
  }).catch(() => {
    // el log nunca debe bloquear ni enmascarar el resultado real — el
    // deploy ya se aplicó y ya se confirmó por consola arriba.
  });
}

// ─────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  RUN_MIGRATIONS — run-runtime-migrations-runner                ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\nstep=${STEP} mode=${MODE} org="${ORG_QUERY ?? ""}"`);

  if (!ORG_QUERY) throw new RunnerInputError("--org es requerido.");
  if (!VALID_STEPS.includes(STEP)) {
    throw new RunnerInputError(`--step inválido: "${STEP}". Valores válidos: ${VALID_STEPS.join(", ")}.`);
  }
  if (MODE !== "DRY_RUN" && MODE !== "EXECUTE") {
    throw new RunnerInputError(`--mode inválido: "${MODE}". Valores válidos: DRY_RUN, EXECUTE.`);
  }
  if (STEP === "DEPLOY" && MODE === "EXECUTE") {
    console.log(
      "\n⚠️  --step DEPLOY --mode EXECUTE: esto ejecuta `prisma migrate deploy` real contra la runtime DB. " +
      "Continúa solo si tienes aprobación explícita para este despliegue.",
    );
  }

  const organization = await resolveOrganization(ORG_QUERY);
  console.log(`\n[control plane] Organización: ${organization.name} (${organization.code})`);

  const profile = await resolveActiveProfile(organization.id, PROFILE_ID);
  console.log(`[control plane] Perfil runtime: "${profile.label}" (${profile.environment}, id=${profile.id})`);

  if (STEP === "INSPECT") {
    stepInspect(profile);
  } else if (STEP === "STATUS") {
    stepStatus(profile);
  } else {
    await stepDeploy(organization, profile);
  }

  console.log("\n✅ Fin. No se usó db push. No se usó migrate dev/reset. No se tocó DTE/MH/firmador/MariaDB.");
}

main()
  .catch((err) => {
    if (err instanceof RunnerInputError) {
      console.error(`\n✗ ${err.message}`);
    } else {
      console.error("\n✗ Error inesperado:", err instanceof Error ? err.message : err);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await controlPlanePrisma.$disconnect();
  });
