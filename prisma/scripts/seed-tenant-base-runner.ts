/**
 * seed-tenant-base-runner.ts
 *
 * SEED_TENANT_BASE — runner controlado para preparar una base runtime
 * nueva o vacía con lo mínimo necesario para que un cliente pueda existir
 * dentro de su propia DB runtime (Runtime Database Router):
 *
 *   1. Tenant base (Gym).
 *   2. Location/sucursal base (Branch).
 *   3. Configuración base del tenant (GymSettings — prefijos de código).
 *   4. Usuario admin inicial (User, role=super_admin).
 *   5. Configuración fiscal mínima (TenantFiscalConfig) — reutiliza el
 *      runner D1B existente (tenant-fiscal-config-runner.ts), no lo
 *      reimplementa.
 *   6. Tenant Binding: PlatformOrganization.tenant_id (solo si está vacío
 *      o ya coincide con el tenant creado/encontrado).
 *   7. Auditoría en PlatformDeploymentLog (control plane), solo en EXECUTE.
 *
 * ── Alcance de la transacción — runtime DB vs control plane ──────────
 * `client.$transaction` (executeSeed) cubre ÚNICAMENTE la runtime DB:
 * Gym + Branch + GymSettings + User + TenantFiscalConfig. Es una base de
 * datos físicamente distinta de la control plane (otra `DATABASE_URL`,
 * otro `PrismaClient`), así que NO puede formar parte de la misma
 * transacción SQL que `PlatformOrganization.tenant_id` ni
 * `PlatformDeploymentLog` — eso sería una transacción distribuida
 * (2-phase commit), que este bloque NO implementa a propósito. En su
 * lugar, la ejecución queda ordenada y explícita:
 *   (a) runtime tx (atómica) → si falla, rollback completo, nada se
 *       escribió, no se intenta el binding en control plane.
 *   (b) si (a) tuvo éxito, se actualiza tenant_id en control plane. Si
 *       (b) falla, el error se propaga tal cual (no se traga) e indica
 *       explícitamente que el tenant SÍ quedó creado en runtime pero el
 *       binding NO se aplicó — requiere revisión/reintento manual del
 *       binding, no repetir el seed (que ya es idempotente y no
 *       duplicaría nada si se reintenta completo).
 *   (c) el registro en PlatformDeploymentLog es best-effort — su fallo
 *       nunca enmascara ni revierte (a)/(b), solo se advierte por consola.
 * No hace falta más que esto: no hay two-phase commit, no hay
 * compensación automática — solo orden claro + error explícito.
 *
 * Continuación directa de docs/modules/platform-phase-7-multiclient-provisioning.md
 * §12.1 — mismo patrón que register-dte-signer-credential.ts (INSPECT /
 * DRY_RUN / EXECUTE, confirmación textual, log en control plane) combinado
 * con la compuerta D0 (evaluateDatabaseExecutionSafety) ya usada por
 * run-database-profile-tenant-fiscal-config.action.ts.
 *
 * ── Por qué este runner NO usa withRuntimePrisma/withOrganizationRuntimePrisma ──
 * Ambas funciones (y resolveRuntimeDatabaseProfileForOrganization /
 * resolveRuntimeDatabaseProfileById) exigen que
 * `PlatformOrganization.tenant_id` ya esté asignado — ver
 * runtime-database-router.ts (fetchOrganizationWithTenant lanza
 * OrganizationWithoutTenantError si falta). Ese es exactamente el caso que
 * SEED_TENANT_BASE existe para resolver: la PRIMERA vez que se crea un
 * tenant para una organización nueva, tenant_id todavía es NULL.
 *
 * Por eso este runner resuelve el perfil directamente contra
 * PlatformDatabaseProfile (organization_id + is_active, o --profile
 * explícito) y abre la conexión con `withRuntimePrismaForInspection`
 * (mismo módulo Runtime Database Router, variante ya documentada para
 * "perfiles recién creados... pendientes de Tenant Binding"). Sigue
 * siendo 100% Runtime Database Router — nunca Prisma global — y nunca usa
 * el perfil si no está `is_active`, porque este runner lo valida
 * explícitamente antes de llamar (withRuntimePrismaForInspection no lo
 * exige a propósito, pero este script sí).
 *
 * ── Pasos (--step) ──────────────────────────────────────────────────
 *   INSPECT — solo lectura. Resuelve organización + perfil, abre la
 *             runtime DB, verifica que el schema esté migrado, y reporta
 *             conteos seguros (tenants/locations/admins/DTE). Nunca
 *             escribe. Nunca requiere --confirm ni SEED_TENANT_ADMIN_PASSWORD.
 *   SEED    — (default) DRY_RUN (default) valida inputs, detecta
 *             duplicados y muestra el plan CREATE/SKIP. EXECUTE aplica el
 *             plan dentro de una transacción, es idempotente, y registra
 *             PlatformDeploymentLog.
 *
 * ── Variables de entorno ──────────────────────────────────────────────
 *   SEED_TENANT_ADMIN_PASSWORD — contraseña inicial del admin. NUNCA por
 *   CLI. Requerida solo en --step SEED --mode EXECUTE cuando el admin no
 *   existe todavía. No se imprime en ningún log.
 *
 * ── USO (PowerShell) ──────────────────────────────────────────────────
 *
 *   # 1. INSPECT — solo lectura
 *   npx tsx prisma/scripts/seed-tenant-base-runner.ts `
 *     --org "TRUSTME-0001" --step INSPECT
 *
 *   # 2. SEED — dry-run (no escribe nada) — cliente ficticio de ejemplo
 *   npx tsx prisma/scripts/seed-tenant-base-runner.ts `
 *     --org "DEMO-CLIENTE-0001" --step SEED --mode DRY_RUN `
 *     --tenant-code "demo-cliente-0001" --tenant-name "Demo Cliente 0001" `
 *     --location-name "Sucursal Central" `
 *     --admin-email "admin@demo-cliente-0001.local" --admin-name "Admin Demo"
 *
 *   # 3. SEED — ejecución real — NO EJECUTAR SIN APROBACIÓN EXPLÍCITA
 *   $env:SEED_TENANT_ADMIN_PASSWORD = "..."
 *   npx tsx prisma/scripts/seed-tenant-base-runner.ts `
 *     --org "DEMO-CLIENTE-0001" --step SEED --mode EXECUTE `
 *     --tenant-code "demo-cliente-0001" --tenant-name "Demo Cliente 0001" `
 *     --location-name "Sucursal Central" `
 *     --admin-email "admin@demo-cliente-0001.local" --admin-name "Admin Demo" `
 *     --confirm "SEED TENANT BASE"
 *
 * --profile <profileId>     — opcional, si la organización tiene más de un
 *                              perfil activo (mismo criterio de desempate
 *                              que el Runtime Database Router: PRODUCTION >
 *                              STAGING > SANDBOX > TEST > LOCAL).
 * --location-code <code>    — opcional, SOLO INFORMATIVO. Branch no tiene
 *                              columna `code` en el schema actual — no se
 *                              persiste. No se agrega columna nueva en este
 *                              bloque (fuera de alcance).
 * --country / --timezone    — opcional, SOLO INFORMATIVO (default SV /
 *                              America/El_Salvador). Gym/Branch no tienen
 *                              columnas para esto hoy; no se inventan
 *                              columnas nuevas en este bloque. Se muestran
 *                              solo para contraste con
 *                              PlatformOrganization.country_code/timezone.
 * --backup-confirmed        — requerido SOLO si el perfil resuelto es
 *                              STAGING (D0 exige confirmación de backup en
 *                              STAGING para riesgo MEDIUM). LOCAL/SANDBOX/TEST
 *                              no lo requieren. PRODUCTION está BLOQUEADO
 *                              siempre por D0 para esta acción (ver
 *                              ACTION_EXECUTION_RISK.SEED_TENANT_BASE =
 *                              "MEDIUM" + ENV_POLICY_MATRIX.PRODUCTION.MEDIUM
 *                              = "BLOCKED").
 * --actor <userId>          — opcional. Atribuye triggered_by en el
 *                              PlatformDeploymentLog (control plane). No es
 *                              un User runtime — es solo un identificador
 *                              libre de auditoría, igual que otros runners.
 *
 * ESTE SCRIPT NO EJECUTA MIGRACIONES. Si la runtime DB no tiene el schema
 * aplicado, falla con: "Runtime DB no está migrada. Ejecutar RUN_MIGRATIONS
 * antes." (RUN_MIGRATIONS queda para otro bloque — no implementado aquí.)
 *
 * ESTE SCRIPT NO TOCA DTE/MH/firmador/MariaDB. No crea DteIssuerConfig ni
 * DteCredential. No firma. No transmite. No entrega.
 *
 * Este script NO fue ejecutado en --mode EXECUTE. Preparado y validado
 * (tsc/eslint), en espera de aprobación explícita.
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import type { PrismaClient, Prisma } from "@prisma/client";

import { controlPlanePrisma } from "../../src/modules/platform/runtime/control-plane-prisma";
import {
  withRuntimePrismaForInspection,
  RuntimeDatabaseRouterError,
} from "../../src/modules/platform/runtime/runtime-database-router";
import { evaluateDatabaseExecutionSafety } from "../../src/modules/platform/lib/database-execution-safety";
import {
  runTenantFiscalConfigDryRun,
  runTenantFiscalConfigSeed,
} from "../../src/modules/platform/lib/seed-runners/tenant-fiscal-config-runner";
import type {
  DatabaseExecutionSafetyInput,
  PlatformDatabaseProfileEnvironment,
} from "../../src/modules/platform/types/platform.types";

// ─────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────

type Step = "INSPECT" | "SEED";
type Mode = "DRY_RUN" | "EXECUTE";

const CONFIRMATION_TEXT = "SEED TENANT BASE";

// Mismo desempate que runtime-database-router.ts (ENVIRONMENT_PRIORITY),
// reimplementado localmente porque este runner no puede usar
// resolveRuntimeDatabaseProfileForOrganization (exige tenant_id ya
// asignado — ver header de este archivo).
const ENVIRONMENT_PRIORITY: Record<string, number> = {
  PRODUCTION: 0,
  STAGING: 1,
  SANDBOX: 2,
  TEST: 3,
  LOCAL: 4,
};

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
const STEP             = (argValue("--step") ?? "SEED").toUpperCase() as Step;
const MODE             = (argValue("--mode") ?? "DRY_RUN").toUpperCase() as Mode;
const CONFIRM          = argValue("--confirm");
const TENANT_CODE      = argValue("--tenant-code");
const TENANT_NAME      = argValue("--tenant-name");
const LOCATION_NAME    = argValue("--location-name");
const LOCATION_CODE    = argValue("--location-code"); // informativo — no persistido
const ADMIN_EMAIL      = argValue("--admin-email");
const ADMIN_NAME       = argValue("--admin-name");
const COUNTRY          = argValue("--country") ?? "SV"; // informativo
const TIMEZONE         = argValue("--timezone") ?? "America/El_Salvador"; // informativo
const BACKUP_CONFIRMED = flagPresent("--backup-confirmed");
const ACTOR_ID         = argValue("--actor"); // opcional — triggered_by en PlatformDeploymentLog

const VALID_STEPS: Step[] = ["INSPECT", "SEED"];

class RunnerInputError extends Error {}

// ─────────────────────────────────────────────────────────────────
// Resolución de perfil — SIN exigir organization.tenant_id
// ─────────────────────────────────────────────────────────────────

interface ResolvedProfile {
  id: string;
  label: string;
  environment: string;
  last_test_status: string;
}

async function resolveOrganization(orgQuery: string) {
  const organization = await controlPlanePrisma.platformOrganization.findFirst({
    where: {
      OR: [
        { name: { contains: orgQuery, mode: "insensitive" } },
        { code: { contains: orgQuery, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, code: true, tenant_id: true },
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
      select: {
        id: true, label: true, environment: true, organization_id: true,
        is_active: true, last_test_status: true,
      },
    });
    if (!profile) {
      throw new RunnerInputError(`--profile "${explicitProfileId}" no existe.`);
    }
    if (profile.organization_id !== organizationId) {
      throw new RunnerInputError(
        `--profile "${explicitProfileId}" no pertenece a la organización resuelta.`,
      );
    }
    if (!profile.is_active) {
      throw new RunnerInputError(`--profile "${explicitProfileId}" no está activo (is_active=false).`);
    }
    return profile;
  }

  const candidates = await controlPlanePrisma.platformDatabaseProfile.findMany({
    where: { organization_id: organizationId, is_active: true },
    select: { id: true, label: true, environment: true, last_test_status: true },
  });

  if (candidates.length === 0) {
    throw new RunnerInputError(
      "No hay ningún PlatformDatabaseProfile activo para esta organización. Registrar uno primero.",
    );
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

// Detecta schema no migrado (P2021/P2022) sin filtrar ningún dato sensible.
function isSchemaMissingError(err: unknown): boolean {
  const code = typeof err === "object" && err !== null ? (err as { code?: string }).code : undefined;
  return code === "P2021" || code === "P2022";
}

const RUNTIME_NOT_MIGRATED_MESSAGE =
  "Runtime DB no está migrada. Ejecutar RUN_MIGRATIONS antes.";

// ─────────────────────────────────────────────────────────────────
// INSPECT — solo lectura
// ─────────────────────────────────────────────────────────────────

async function stepInspect(client: PrismaClient) {
  console.log("\n[INSPECT] Solo lectura. No se escribe nada.\n");

  let counts;
  try {
    counts = await Promise.all([
      client.gym.count(),
      client.branch.count(),
      client.user.count({ where: { role: { in: ["super_admin", "branch_admin"] } as never } }),
      client.dteIssuerConfig.count().catch(() => -1),
      client.dteCredential.count().catch(() => -1),
      client.dteCorrelative.count().catch(() => -1),
      client.tenantFiscalConfig.count().catch(() => -1),
    ]);
  } catch (err) {
    if (isSchemaMissingError(err)) {
      throw new RunnerInputError(RUNTIME_NOT_MIGRATED_MESSAGE);
    }
    throw err;
  }

  const [gymCount, branchCount, adminCount, issuerCount, credentialCount, correlativeCount, fiscalConfigCount] = counts;

  console.log(`[INSPECT] tenants (Gym):               ${gymCount}`);
  console.log(`[INSPECT] locations (Branch):           ${branchCount}`);
  console.log(`[INSPECT] admins (super_admin/branch_admin): ${adminCount}`);
  console.log(`[INSPECT] TenantFiscalConfig:           ${fiscalConfigCount}`);
  console.log(`[INSPECT] DteIssuerConfig:              ${issuerCount}`);
  console.log(`[INSPECT] DteCredential:                ${credentialCount}`);
  console.log(`[INSPECT] DteCorrelative:               ${correlativeCount}`);

  if (TENANT_CODE) {
    const existingGym = await client.gym.findUnique({
      where: { slug: TENANT_CODE },
      select: { id: true, name: true, status: true },
    });
    console.log(
      existingGym
        ? `\n[INSPECT] Ya existe un Gym con slug "${TENANT_CODE}": ${existingGym.name} [${existingGym.status}] (id=${existingGym.id}).`
        : `\n[INSPECT] No existe ningún Gym con slug "${TENANT_CODE}" todavía.`,
    );
  }
  if (ADMIN_EMAIL) {
    const existingUser = await client.user.findUnique({
      where: { email: ADMIN_EMAIL },
      select: { id: true, gym_id: true, role: true, status: true },
    });
    console.log(
      existingUser
        ? `[INSPECT] Ya existe un User con email "${ADMIN_EMAIL}" (gym_id=${existingUser.gym_id}, role=${existingUser.role}, status=${existingUser.status}).`
        : `[INSPECT] No existe ningún User con email "${ADMIN_EMAIL}" todavía.`,
    );
  }

  console.log("\n[INSPECT] No se imprimió ningún secret. No se escribió nada.");
}

// ─────────────────────────────────────────────────────────────────
// SEED — validación de inputs y construcción del plan
// ─────────────────────────────────────────────────────────────────

interface SeedInputs {
  tenantCode: string;
  tenantName: string;
  locationName: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateSeedInputs(): SeedInputs {
  const missing: string[] = [];
  if (!TENANT_CODE) missing.push("--tenant-code");
  if (!TENANT_NAME) missing.push("--tenant-name");
  if (!LOCATION_NAME) missing.push("--location-name");
  if (!ADMIN_EMAIL) missing.push("--admin-email");
  if (!ADMIN_NAME) missing.push("--admin-name");
  if (missing.length > 0) {
    throw new RunnerInputError(`Faltan argumentos requeridos: ${missing.join(", ")}.`);
  }
  if (!EMAIL_RE.test(ADMIN_EMAIL!)) {
    throw new RunnerInputError(`--admin-email "${ADMIN_EMAIL}" no tiene formato de email válido.`);
  }

  const nameParts = ADMIN_NAME!.trim().split(/\s+/);
  const adminFirstName = nameParts[0];
  const adminLastName = nameParts.slice(1).join(" ") || nameParts[0];

  return {
    tenantCode: TENANT_CODE!,
    tenantName: TENANT_NAME!,
    locationName: LOCATION_NAME!,
    adminEmail: ADMIN_EMAIL!,
    adminFirstName,
    adminLastName,
  };
}

interface SeedPlanItem {
  entity: "Gym" | "Branch" | "GymSettings" | "User" | "TenantFiscalConfig" | "PlatformOrganization.tenant_id";
  action: "CREATE" | "SKIP" | "UPDATE" | "ERROR";
  detail: string;
}

interface SeedPlan {
  items: SeedPlanItem[];
  resolvedTenantId: string | null; // null si aún no existe (se crearía)
  hasErrors: boolean;
}

async function buildSeedPlan(
  client: PrismaClient,
  inputs: SeedInputs,
  organizationTenantId: string | null,
): Promise<SeedPlan> {
  const items: SeedPlanItem[] = [];
  let hasErrors = false;

  // 1. Tenant (Gym) por slug
  const existingGym = await client.gym.findUnique({
    where: { slug: inputs.tenantCode },
    select: { id: true, name: true, status: true },
  });

  if (existingGym) {
    items.push({
      entity: "Gym",
      action: "SKIP",
      detail: `Ya existe Gym "${existingGym.name}" [${existingGym.status}] con slug "${inputs.tenantCode}" (id=${existingGym.id}).`,
    });
  } else {
    items.push({
      entity: "Gym",
      action: "CREATE",
      detail: `Se creará Gym "${inputs.tenantName}" con slug "${inputs.tenantCode}".`,
    });
  }
  const tenantId = existingGym?.id ?? null;

  // 2. Location (Branch) — solo se puede resolver duplicado si el tenant ya existe
  if (tenantId) {
    const existingBranch = await client.branch.findFirst({
      where: { gym_id: tenantId, name: inputs.locationName },
      select: { id: true, status: true },
    });
    items.push(
      existingBranch
        ? {
            entity: "Branch",
            action: "SKIP",
            detail: `Ya existe Branch "${inputs.locationName}" [${existingBranch.status}] (id=${existingBranch.id}).`,
          }
        : {
            entity: "Branch",
            action: "CREATE",
            detail: `Se creará Branch "${inputs.locationName}" bajo el tenant existente.`,
          },
    );
  } else {
    items.push({
      entity: "Branch",
      action: "CREATE",
      detail: `Se creará Branch "${inputs.locationName}" junto con el tenant nuevo.`,
    });
  }

  // 3. GymSettings — @unique por gym_id
  if (tenantId) {
    const existingSettings = await client.gymSettings.findUnique({
      where: { gym_id: tenantId },
      select: { id: true },
    });
    items.push(
      existingSettings
        ? { entity: "GymSettings", action: "SKIP", detail: `Ya existe GymSettings (id=${existingSettings.id}).` }
        : { entity: "GymSettings", action: "CREATE", detail: "Se creará GymSettings con valores por defecto." },
    );
  } else {
    items.push({ entity: "GymSettings", action: "CREATE", detail: "Se creará GymSettings con valores por defecto." });
  }

  // 4. Admin User — email es @unique GLOBAL (no solo por tenant)
  const existingUser = await client.user.findUnique({
    where: { email: inputs.adminEmail },
    select: { id: true, gym_id: true, role: true, status: true },
  });

  if (existingUser) {
    if (tenantId && existingUser.gym_id === tenantId) {
      items.push({
        entity: "User",
        action: "SKIP",
        detail: `Ya existe el admin "${inputs.adminEmail}" en este tenant (role=${existingUser.role}, status=${existingUser.status}).`,
      });
    } else {
      items.push({
        entity: "User",
        action: "ERROR",
        detail: `El email "${inputs.adminEmail}" ya existe pero pertenece a otro tenant (gym_id=${existingUser.gym_id}). ` +
          "email es único globalmente — no se puede reutilizar entre tenants distintos.",
      });
      hasErrors = true;
    }
  } else {
    items.push({
      entity: "User",
      action: "CREATE",
      detail: `Se creará el admin "${inputs.adminEmail}" con role=super_admin.`,
    });
  }

  // 5. TenantFiscalConfig — reutiliza el runner D1B existente, solo si hay tenantId resuelto
  if (tenantId) {
    const fiscalDryRun = await runTenantFiscalConfigDryRun(client, { tenantId });
    items.push({
      entity: "TenantFiscalConfig",
      action: fiscalDryRun.wouldCreate ? "CREATE" : "SKIP",
      detail: fiscalDryRun.wouldCreate
        ? "Se creará TenantFiscalConfig con valores por defecto (is_retention_agent=false)."
        : `Ya existe TenantFiscalConfig (id=${fiscalDryRun.existingConfigId}).`,
    });
  } else {
    items.push({
      entity: "TenantFiscalConfig",
      action: "CREATE",
      detail: "Se creará TenantFiscalConfig con valores por defecto, una vez creado el tenant.",
    });
  }

  // 6. Tenant Binding — PlatformOrganization.tenant_id
  const finalTenantId = tenantId; // el binding real solo se conoce tras EXECUTE si tenantId era null
  if (organizationTenantId) {
    if (tenantId && organizationTenantId !== tenantId) {
      items.push({
        entity: "PlatformOrganization.tenant_id",
        action: "ERROR",
        detail: `La organización ya tiene tenant_id="${organizationTenantId}", distinto del tenant resuelto (id=${tenantId}). ` +
          "No se sobrescribirá. Revisar manualmente.",
      });
      hasErrors = true;
    } else {
      items.push({
        entity: "PlatformOrganization.tenant_id",
        action: "SKIP",
        detail: `La organización ya tiene tenant_id="${organizationTenantId}" — coincide o se validará al crear.`,
      });
    }
  } else {
    items.push({
      entity: "PlatformOrganization.tenant_id",
      action: "UPDATE",
      detail: tenantId
        ? `Se asignará tenant_id="${tenantId}" (tenant ya existente).`
        : "Se asignará tenant_id al id del tenant recién creado.",
    });
  }

  return { items, resolvedTenantId: finalTenantId, hasErrors };
}

function printPlan(plan: SeedPlan) {
  console.log("\n[PLAN] Resumen de operaciones:");
  for (const item of plan.items) {
    const marker = item.action === "ERROR" ? "✗" : item.action === "CREATE" || item.action === "UPDATE" ? "+" : "=";
    console.log(`  ${marker} [${item.action}] ${item.entity}: ${item.detail}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// SEED EXECUTE — aplica el plan dentro de una transacción
// ─────────────────────────────────────────────────────────────────

interface SeedExecuteResult {
  tenantId: string;
  branchId: string;
  adminUserId: string | null; // null si ya existía y se omitió
  gymSettingsCreated: boolean;
  tenantFiscalConfigId: string;
  tenantBindingUpdated: boolean;
}

async function executeSeed(
  client: PrismaClient,
  inputs: SeedInputs,
  plan: SeedPlan,
): Promise<SeedExecuteResult> {
  const adminPassword = process.env.SEED_TENANT_ADMIN_PASSWORD;
  const userPlanItem = plan.items.find((i) => i.entity === "User")!;
  if (userPlanItem.action === "CREATE" && !adminPassword?.trim()) {
    throw new RunnerInputError(
      "SEED_TENANT_ADMIN_PASSWORD no está configurada. Requerida para crear el admin inicial " +
      "(nunca se acepta por argumento CLI).",
    );
  }

  return client.$transaction(async (tx) => {
    // 1. Tenant (Gym) — idempotente por slug
    const gym = await tx.gym.upsert({
      where: { slug: inputs.tenantCode },
      update: {},
      create: { name: inputs.tenantName, slug: inputs.tenantCode, status: "active" },
      select: { id: true },
    });
    const tenantId = gym.id;

    // 2. Location (Branch) — idempotente por (gym_id, name)
    let branch = await tx.branch.findFirst({
      where: { gym_id: tenantId, name: inputs.locationName },
      select: { id: true },
    });
    if (!branch) {
      branch = await tx.branch.create({
        data: { gym_id: tenantId, tenant_id: tenantId, name: inputs.locationName, status: "active" },
        select: { id: true },
      });
    }

    // 3. GymSettings — idempotente por gym_id (@unique)
    const existingSettings = await tx.gymSettings.findUnique({
      where: { gym_id: tenantId },
      select: { id: true },
    });
    if (!existingSettings) {
      await tx.gymSettings.create({ data: { gym_id: tenantId, tenant_id: tenantId } });
    }

    // 4. Admin User — idempotente por email (@unique global)
    let adminUserId: string | null = null;
    const existingUser = await tx.user.findUnique({
      where: { email: inputs.adminEmail },
      select: { id: true, gym_id: true },
    });
    if (existingUser) {
      if (existingUser.gym_id !== tenantId) {
        throw new RunnerInputError(
          `El email "${inputs.adminEmail}" ya existe y pertenece a otro tenant. Abortando transacción.`,
        );
      }
      // ya existe en este tenant — SKIP, no se modifica.
    } else {
      const passwordHash = await bcrypt.hash(adminPassword!, 10);
      const created = await tx.user.create({
        data: {
          gym_id: tenantId,
          tenant_id: tenantId,
          branch_id: branch.id,
          location_id: branch.id,
          email: inputs.adminEmail,
          password_hash: passwordHash,
          first_name: inputs.adminFirstName,
          last_name: inputs.adminLastName,
          role: "super_admin",
          status: "active",
        },
        select: { id: true },
      });
      adminUserId = created.id;
    }

    // 5. TenantFiscalConfig — reutiliza el runner D1B existente (upsert idempotente)
    const fiscalResult = await runTenantFiscalConfigSeed(tx as unknown as PrismaClient, { tenantId });

    return {
      tenantId,
      branchId: branch.id,
      adminUserId,
      gymSettingsCreated: !existingSettings,
      tenantFiscalConfigId: fiscalResult.configId,
      tenantBindingUpdated: false, // se actualiza fuera de la transacción runtime (control plane)
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  SEED_TENANT_BASE — seed-tenant-base-runner                    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\nstep=${STEP} mode=${MODE} org="${ORG_QUERY ?? ""}"`);

  if (!ORG_QUERY) throw new RunnerInputError("--org es requerido.");
  if (!VALID_STEPS.includes(STEP)) {
    throw new RunnerInputError(`--step inválido: "${STEP}". Valores válidos: ${VALID_STEPS.join(", ")}.`);
  }
  if (MODE !== "DRY_RUN" && MODE !== "EXECUTE") {
    throw new RunnerInputError(`--mode inválido: "${MODE}". Valores válidos: DRY_RUN, EXECUTE.`);
  }

  console.log(`(informativo, no persistido) country=${COUNTRY} timezone=${TIMEZONE}` + (LOCATION_CODE ? ` location-code=${LOCATION_CODE}` : ""));

  const organization = await resolveOrganization(ORG_QUERY);
  console.log(`\n[control plane] Organización: ${organization.name} (${organization.code})`);
  console.log(`[control plane] tenant_id actual: ${organization.tenant_id ?? "NULL (sin asignar)"}`);

  const profile = await resolveActiveProfile(organization.id, PROFILE_ID);
  console.log(`[control plane] Perfil runtime: "${profile.label}" (${profile.environment}, id=${profile.id})`);
  console.log(`[control plane] last_test_status del perfil: ${profile.last_test_status}`);

  let logStatus: "SUCCESS" | "FAILED" = "SUCCESS";
  let logNotes = `step=${STEP} mode=${MODE}`;
  let logMetadata: Record<string, unknown> = {};

  try {
    await withRuntimePrismaForInspection(profile.id, async (client) => {
      if (STEP === "INSPECT") {
        await stepInspect(client);
        return;
      }

      // ── STEP SEED ──────────────────────────────────────────────
      const inputs = validateSeedInputs();
      const plan = await buildSeedPlan(client, inputs, organization.tenant_id);
      printPlan(plan);

      if (plan.hasErrors) {
        throw new RunnerInputError(
          "El plan tiene errores (ver arriba con marca ✗). Corrige los conflictos antes de continuar.",
        );
      }

      if (MODE === "DRY_RUN") {
        console.log("\n[DRY_RUN] Precondiciones OK. NO se escribió nada.");
        return;
      }

      // ── MODE EXECUTE — compuerta D0 ─────────────────────────────
      const environment = profile.environment as PlatformDatabaseProfileEnvironment;
      const safetyInput: DatabaseExecutionSafetyInput = {
        actionType: "SEED_TENANT_BASE",
        profileEnvironment: environment,
        targetType: "CLIENT_RUNTIME",
        isDryRun: false,
        confirmationText: CONFIRM,
        expectedConfirmationText: CONFIRMATION_TEXT,
        hasRecentSuccessfulConnectionTest: profile.last_test_status === "SUCCESS",
        hasRecentPreflight: true, // buildSeedPlan() ya validó el schema y detectó duplicados en esta misma corrida
        hasBackupConfirmation: environment === "STAGING" ? BACKUP_CONFIRMED : undefined,
      };
      const safety = evaluateDatabaseExecutionSafety(safetyInput);

      for (const msg of safety.messages) console.log(`[D0] ${msg}`);
      for (const w of safety.warnings) console.log(`[D0][warning] ${w}`);

      if (!safety.allowed) {
        for (const b of safety.blockers) console.error(`[D0][blocker] ${b}`);
        throw new RunnerInputError(safety.blockers[0] ?? "Acción bloqueada por el safety gate (D0).");
      }

      const result = await executeSeed(client, inputs, plan);
      console.log(
        `\n✅ [EXECUTE] tenant_id=${result.tenantId} branch_id=${result.branchId} ` +
        `admin=${result.adminUserId ? "creado" : "ya existía (sin cambios)"} ` +
        `gymSettings=${result.gymSettingsCreated ? "creado" : "ya existía"} ` +
        `tenantFiscalConfigId=${result.tenantFiscalConfigId}`,
      );

      // ── Tenant Binding — control plane, FUERA de la transacción runtime ──
      // La runtime tx de arriba ya se confirmó (COMMIT). Esta es una base
      // física distinta (control plane) — no existe una transacción SQL
      // conjunta posible sin 2-phase commit (no implementado a propósito,
      // ver header del archivo). Si este paso falla, el tenant/branch/admin
      // YA quedaron creados en runtime; el error se propaga explícito para
      // que el operador sepa que falta aplicar el binding manualmente (no
      // hay rollback automático de la runtime tx, que ya fue confirmada).
      let tenantBindingUpdated = false;
      if (!organization.tenant_id) {
        try {
          await controlPlanePrisma.platformOrganization.update({
            where: { id: organization.id },
            data: { tenant_id: result.tenantId },
          });
          tenantBindingUpdated = true;
          console.log(`✅ [EXECUTE] PlatformOrganization.tenant_id asignado: ${result.tenantId}`);
        } catch (bindingErr) {
          throw new RunnerInputError(
            `El tenant runtime SÍ se creó/confirmó (tenant_id=${result.tenantId}, ya con commit en la runtime DB), ` +
            "pero falló la actualización de PlatformOrganization.tenant_id en control plane: " +
            `${bindingErr instanceof Error ? bindingErr.message : String(bindingErr)}. ` +
            "Aplicar el binding manualmente en Platform Admin — no repetir el seed completo (es idempotente, " +
            "pero el binding no se reintenta solo).",
          );
        }
      } else if (organization.tenant_id !== result.tenantId) {
        // No debería ocurrir — buildSeedPlan() ya lo hubiese marcado ERROR.
        throw new RunnerInputError(
          `Inconsistencia: organization.tenant_id="${organization.tenant_id}" no coincide con el tenant ` +
          `resuelto (${result.tenantId}). Tenant Binding NO actualizado.`,
        );
      }

      logMetadata = {
        profileId: profile.id,
        profileLabel: profile.label,
        environment: profile.environment,
        tenantId: result.tenantId,
        branchId: result.branchId,
        adminCreated: !!result.adminUserId,
        gymSettingsCreated: result.gymSettingsCreated,
        tenantFiscalConfigId: result.tenantFiscalConfigId,
        tenantBindingUpdated,
        actorId: ACTOR_ID ?? null,
      };
    });
  } catch (err) {
    logStatus = "FAILED";
    logNotes = `step=${STEP} mode=${MODE} error=${err instanceof Error ? err.message : String(err)}`;
    throw err;
  } finally {
    // Log de control plane — solo para SEED en EXECUTE. INSPECT y DRY_RUN
    // nunca generan log (no escriben nada). Este log es best-effort y va
    // DESPUÉS de la runtime tx + el binding: si ambos ya ocurrieron, el log
    // solo registra evidencia: nunca revierte lo ya confirmado en runtime
    // ni bloquea el resultado si el log mismo falla (catch vacío abajo).
    if (STEP === "SEED" && MODE === "EXECUTE") {
      try {
        await controlPlanePrisma.platformDeploymentLog.create({
          data: {
            organization_id: organization.id,
            action: "SEED_TENANT_BASE",
            status: logStatus,
            notes: logNotes,
            triggered_by: ACTOR_ID ?? null,
            metadata: logMetadata as Prisma.InputJsonObject,
          },
        });
      } catch {
        // el log nunca debe bloquear ni enmascarar el resultado real
      }
    }
  }

  console.log("\n✅ Fin. No se ejecutó ninguna migración. No se tocó DTE/MH/firmador/MariaDB.");
}

main()
  .catch((err) => {
    if (err instanceof RunnerInputError) {
      console.error(`\n✗ ${err.message}`);
    } else if (err instanceof RuntimeDatabaseRouterError) {
      console.error(`\n✗ [${err.code}] ${err.message}`);
    } else {
      console.error("\n✗ Error inesperado:", err instanceof Error ? err.message : err);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await controlPlanePrisma.$disconnect();
  });
