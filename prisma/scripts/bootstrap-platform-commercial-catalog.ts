/**
 * bootstrap-platform-commercial-catalog.ts
 *
 * Bootstrap comercial del Control Plane de producción, DESPUÉS de Bloque A
 * (modelo) y Bloque B (enforcement real, main@1b3ee87). Siembra el catálogo
 * comercial base (verticales, planes base, módulos, entitlement
 * definitions) y configura las DOS organizaciones reales YA EXISTENTES
 * (gym-0001, trustme-0001) con sus módulos activos y overrides Unlimited
 * transitorios — SIN asignarles plan todavía y SIN crear ninguna
 * organización nueva.
 *
 * Por qué este runner y no `prisma db seed` / `seedPlatform()` directo:
 * `seedPlatform()` (prisma/seeds/seed.platform.ts) además de sembrar el
 * catálogo hace upsert de una organización `gym-sv-main` — en producción
 * ya existen `gym-0001`/`trustme-0001` y NO queremos crear una tercera
 * organización ni tocar campos de las existentes que ese seed sí modifica
 * (status, license_status, billing_cycle, country_code, timezone, plan_id).
 * Este runner reutiliza (importa, no copia) las mismas definiciones de
 * catálogo de seed.platform.ts vía bootstrap-platform-commercial-catalog.lib.ts,
 * pero implementa una ruta de organización completamente distinta:
 * localizar por code exacto, abortar si no existe, tocar ÚNICAMENTE los
 * campos explícitamente mencionados en el plan aprobado (vertical_id de
 * gym-0001; módulos activos y overrides de ambas).
 *
 * ── Modos ────────────────────────────────────────────────────────────
 *   INSPECT (default absoluto) — 100% read-only. Imprime fingerprint de
 *     conexión (sin password), estado actual del catálogo y de ambas
 *     organizaciones, y el plan CREATE/SKIP/CONFLICT exacto que aplicaría
 *     EXECUTE. Cero writes, sin excepción.
 *   EXECUTE — requiere AMBOS gates de entorno exactos:
 *       PLATFORM_COMMERCIAL_BOOTSTRAP_MODE=EXECUTE
 *       PLATFORM_COMMERCIAL_BOOTSTRAP_CONFIRM=BOOTSTRAP_CONTROL_PLANE_COMMERCIAL
 *     Si falta o no coincide cualquiera de los dos, aborta con exit(1)
 *     ANTES de tocar la base de datos. Todo el EXECUTE corre dentro de
 *     una única transacción (`prisma.$transaction`) — si algo falla
 *     (incluyendo que gym-0001/trustme-0001 no existan), rollback
 *     completo, no queda nada a medio escribir.
 *
 * ── Idempotencia ─────────────────────────────────────────────────────
 * Catálogo (verticales/planes/módulos/entitlement definitions): upsert
 * por `code` único, igual que seed.platform.ts. Módulos por organización:
 * upsert por (organization_id, module_id) único, is_active:true — si ya
 * está activo, no-op funcional. Overrides Unlimited: create solo si no
 * existe; si ya existe con exactamente is_unlimited:true/numeric_value:null,
 * no-op; si existe con otra configuración, se reporta como CONFLICT y NO
 * se sobrescribe (podría ser una decisión de negocio ya tomada a mano).
 * Vertical de gym-0001: update de vertical_id (mismo valor en una segunda
 * corrida = no-op).
 *
 * ── Qué este runner NUNCA hace ───────────────────────────────────────
 *   - Crear organizaciones (ni gym-sv-main ni ninguna otra).
 *   - Tocar tenant_id, runtime profile, PlatformDatabaseProfile, status,
 *     license_status, billing_cycle, domain, deployment_url,
 *     provisioning_status, ni ningún campo de PlatformOrganization no
 *     mencionado explícitamente arriba.
 *   - Tocar plan_id de ninguna organización.
 *   - Crear PlatformPlanModule ni PlatformPlanEntitlement (composición de
 *     planes pendiente de aprobación comercial — ver seed.platform.ts).
 *   - Crear override para fiscal.dte.monthly_issued (bloque siguiente).
 *   - Borrar ningún registro, resetear schema, correr `db push`/`migrate
 *     dev`/`migrate reset`, tocar MariaDB/firmador/DTE/secretos, ni hacer
 *     deploy/commit/push.
 *
 * ── Uso ──────────────────────────────────────────────────────────────
 *   npx tsx prisma/scripts/bootstrap-platform-commercial-catalog.ts
 *     -> INSPECT (default, sin necesidad de ninguna variable).
 *
 *   PLATFORM_COMMERCIAL_BOOTSTRAP_MODE=EXECUTE `
 *   PLATFORM_COMMERCIAL_BOOTSTRAP_CONFIRM=BOOTSTRAP_CONTROL_PLANE_COMMERCIAL `
 *   npx tsx prisma/scripts/bootstrap-platform-commercial-catalog.ts
 *     -> EXECUTE (PowerShell: variables como prefijo de línea de comandos,
 *        ver comando exacto en el reporte de cierre de esta pasada).
 */

import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  VERTICALS,
  PLANS,
  MODULES,
  shouldSeedBasePlans,
  ENTITLEMENT_DEFINITIONS,
  TARGET_ORG_CODES,
  TRUSTME_MODULE_CODES,
  GYM_MODULE_CODES,
  UNLIMITED_ENTITLEMENT_CODES,
  DEFERRED_ENTITLEMENT_CODE,
  assertCatalogConsistency,
  planModuleActivation,
  planUnlimitedOverrides,
  type ExistingOrganizationModuleRow,
  type ExistingOverrideRow,
} from "./bootstrap-platform-commercial-catalog.lib";

const prisma = new PrismaClient();

// ── Gates de modo (EXECUTE requiere AMBOS, exactos) ────────────────

type RunMode = "INSPECT" | "EXECUTE";

const CONFIRM_TOKEN = "BOOTSTRAP_CONTROL_PLANE_COMMERCIAL";

function resolveMode(): RunMode {
  const raw = (process.env.PLATFORM_COMMERCIAL_BOOTSTRAP_MODE ?? "INSPECT").trim();

  if (raw !== "INSPECT" && raw !== "EXECUTE") {
    console.error(
      `❌  PLATFORM_COMMERCIAL_BOOTSTRAP_MODE="${raw}" no es válido. Valores permitidos: INSPECT (default) | EXECUTE.`,
    );
    process.exit(1);
  }

  if (raw === "EXECUTE") {
    const confirm = process.env.PLATFORM_COMMERCIAL_BOOTSTRAP_CONFIRM;
    if (confirm !== CONFIRM_TOKEN) {
      console.error(
        "❌  EXECUTE solicitado pero falta o no coincide PLATFORM_COMMERCIAL_BOOTSTRAP_CONFIRM.\n" +
        `    Se requiere exactamente: PLATFORM_COMMERCIAL_BOOTSTRAP_CONFIRM=${CONFIRM_TOKEN}\n` +
        "    Abortando ANTES de cualquier acceso de escritura. No se tocó la base de datos.",
      );
      process.exit(1);
    }
  }

  return raw as RunMode;
}

// ── Fingerprint de conexión — nunca password, nunca URL completa ───

function printConnectionFingerprint(): void {
  const raw = process.env.DATABASE_URL;
  console.log("── Conexión (Control Plane) ────────────────────────────");
  if (!raw) {
    console.log("  ⚠️  DATABASE_URL no está definida en el entorno actual.");
    return;
  }
  try {
    const u = new URL(raw);
    const schema = u.searchParams.get("schema") ?? "(default)";
    console.log(`  provider : ${u.protocol.replace(":", "")}`);
    console.log(`  host     : ${u.hostname}`);
    console.log(`  port     : ${u.port || "(default)"}`);
    console.log(`  database : ${u.pathname.replace(/^\//, "") || "(desconocido)"}`);
    console.log(`  schema   : ${schema}`);
  } catch {
    console.log("  ⚠️  No se pudo parsear DATABASE_URL de forma segura — se omite el fingerprint.");
  }
  if (process.env.DIRECT_URL && process.env.DIRECT_URL !== raw) {
    console.log("  ⚠️  DIRECT_URL está definida y es DISTINTA de DATABASE_URL.");
    console.log("      Este runner usa siempre DATABASE_URL (igual que el resto del runtime app).");
    console.log("      Si el objetivo real de este bootstrap es el Control Plane remoto, confirma");
    console.log("      que DATABASE_URL del entorno actual ya apunta a esa base antes de EXECUTE.");
  }
  console.log("");
}

// ── INSPECT — 100% read-only ────────────────────────────────────────

async function inspectCatalog() {
  const [verticals, plans, modules, entitlementDefs] = await Promise.all([
    prisma.platformVertical.findMany({ orderBy: { code: "asc" }, select: { code: true, name: true } }),
    prisma.platformPlan.findMany({ orderBy: { code: "asc" }, select: { code: true, name: true } }),
    prisma.platformModule.findMany({
      orderBy: { code: "asc" },
      select: { code: true, name: true, category: true, is_core: true, vertical: { select: { code: true } } },
    }),
    prisma.platformEntitlementDefinition.findMany({
      orderBy: { code: "asc" },
      select: { code: true, name: true, value_type: true, period_type: true },
    }),
  ]);

  console.log("── Catálogo actual ──────────────────────────────────────");
  console.log(`  PlatformVertical              : ${verticals.length} → [${verticals.map((v) => v.code).join(", ") || "—"}]`);
  console.log(`  PlatformPlan                  : ${plans.length} → [${plans.map((p) => p.code).join(", ") || "—"}]`);
  console.log(`  PlatformModule                : ${modules.length} → [${modules.map((m) => m.code).join(", ") || "—"}]`);
  console.log(`  PlatformEntitlementDefinition : ${entitlementDefs.length} → [${entitlementDefs.map((e) => e.code).join(", ") || "—"}]`);
  console.log("");

  return { verticals, plans, modules, entitlementDefs };
}

interface OrgSnapshot {
  found: boolean;
  id: string | null;
  code: string;
  name: string | null;
  tenant_id: string | null;
  vertical_id: string | null;
  vertical_code: string | null;
  plan_id: string | null;
  plan_code: string | null;
  modules: ExistingOrganizationModuleRow[];
  overrides: ExistingOverrideRow[];
}

async function inspectOrganization(code: string): Promise<OrgSnapshot> {
  const org = await prisma.platformOrganization.findUnique({
    where: { code },
    select: {
      id: true, code: true, name: true, tenant_id: true,
      vertical_id: true, plan_id: true,
      vertical: { select: { code: true } },
      plan:     { select: { code: true } },
    },
  });

  if (!org) {
    return {
      found: false, id: null, code, name: null, tenant_id: null,
      vertical_id: null, vertical_code: null, plan_id: null, plan_code: null,
      modules: [], overrides: [],
    };
  }

  const [moduleRows, overrideRows] = await Promise.all([
    prisma.platformOrganizationModule.findMany({
      where: { organization_id: org.id },
      select: { is_active: true, module: { select: { code: true } } },
    }),
    prisma.platformOrganizationEntitlementOverride.findMany({
      where: { organization_id: org.id },
      select: { is_unlimited: true, numeric_value: true, entitlement_definition: { select: { code: true } } },
    }),
  ]);

  return {
    found: true,
    id: org.id,
    code: org.code,
    name: org.name,
    tenant_id: org.tenant_id,
    vertical_id: org.vertical_id,
    vertical_code: org.vertical?.code ?? null,
    plan_id: org.plan_id,
    plan_code: org.plan?.code ?? null,
    modules: moduleRows.map((r) => ({ module_code: r.module.code, is_active: r.is_active })),
    overrides: overrideRows.map((r) => ({
      entitlement_code: r.entitlement_definition.code,
      is_unlimited: r.is_unlimited,
      numeric_value: r.numeric_value,
    })),
  };
}

function printOrgSnapshotAndPlan(
  snapshot: OrgSnapshot,
  desiredModuleCodes: readonly string[],
  desiredVerticalCode: string | null,
) {
  console.log(`── Organización: ${snapshot.code} ───────────────────────`);
  if (!snapshot.found) {
    console.log("  ❌  NO EXISTE. EXECUTE abortaría (no se crea ninguna organización).");
    console.log("");
    return;
  }

  console.log(`  id            : ${snapshot.id}`);
  console.log(`  name          : ${snapshot.name}`);
  console.log(`  tenant_id     : ${snapshot.tenant_id ?? "(null)"}`);
  console.log(`  vertical_id   : ${snapshot.vertical_id ?? "(null)"} ${snapshot.vertical_code ? `[${snapshot.vertical_code}]` : ""}`);
  console.log(`  plan_id       : ${snapshot.plan_id ?? "(null)"} ${snapshot.plan_code ? `[${snapshot.plan_code}]` : ""}`);
  console.log(`  módulos activos hoy   : [${snapshot.modules.filter((m) => m.is_active).map((m) => m.module_code).join(", ") || "—"}]`);
  console.log(`  overrides existentes  : [${snapshot.overrides.map((o) => `${o.entitlement_code}(unlimited=${o.is_unlimited},value=${o.numeric_value})`).join(", ") || "—"}]`);

  console.log("  → Plan que aplicaría EXECUTE:");
  if (desiredVerticalCode) {
    if (snapshot.vertical_code === desiredVerticalCode) {
      console.log(`    vertical_id : ya es ${desiredVerticalCode} — no-op.`);
    } else {
      console.log(`    vertical_id : SET → ${desiredVerticalCode} (actual: ${snapshot.vertical_code ?? "null"}).`);
    }
  } else {
    console.log("    vertical_id : sin cambio (debe permanecer null).");
  }
  console.log(`    plan_id     : sin cambio (permanece ${snapshot.plan_id ?? "null"}).`);

  const modulePlan = planModuleActivation(desiredModuleCodes, snapshot.modules);
  console.log(`    módulos CREATE     : [${modulePlan.toCreate.join(", ") || "—"}]`);
  console.log(`    módulos REACTIVATE : [${modulePlan.toReactivate.join(", ") || "—"}]`);
  console.log(`    módulos sin cambio : [${modulePlan.alreadyActive.join(", ") || "—"}]`);

  const overridePlan = planUnlimitedOverrides(UNLIMITED_ENTITLEMENT_CODES, snapshot.overrides);
  console.log(`    overrides CREATE (Unlimited) : [${overridePlan.toCreate.join(", ") || "—"}]`);
  console.log(`    overrides ya correctos        : [${overridePlan.alreadyCorrect.join(", ") || "—"}]`);
  if (overridePlan.conflicting.length > 0) {
    console.log(`    ⚠️  overrides CONFLICT (existen con otra config, NO se tocarían): [${overridePlan.conflicting.join(", ")}]`);
  }
  console.log(`    override "${DEFERRED_ENTITLEMENT_CODE}" : deliberadamente NO se crea (queda UNCONFIGURED).`);
  console.log("");
}

async function runInspect() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(" bootstrap-platform-commercial-catalog — MODO INSPECT (read-only)");
  console.log("═══════════════════════════════════════════════════════════\n");

  printConnectionFingerprint();
  await inspectCatalog();

  const gymSnapshot = await inspectOrganization(TARGET_ORG_CODES.GYM);
  printOrgSnapshotAndPlan(gymSnapshot, GYM_MODULE_CODES, "GYM");

  const trustmeSnapshot = await inspectOrganization(TARGET_ORG_CODES.TRUSTME);
  printOrgSnapshotAndPlan(trustmeSnapshot, TRUSTME_MODULE_CODES, null);

  console.log("── Catálogo que sembraría/actualizaría EXECUTE (upsert por code) ──");
  console.log(`  Verticales                    : ${VERTICALS.map((v) => v.code).join(", ")}`);
  console.log(`  Planes base (sin composición)  : ${PLANS.map((p) => p.code).join(", ")} (solo si no existe ningún plan)`);
  console.log(`  Módulos                        : ${MODULES.map((m) => m.code).join(", ")}`);
  console.log(`  Entitlement definitions        : ${ENTITLEMENT_DEFINITIONS.map((e) => e.code).join(", ")}`);
  console.log("");
  console.log("  NOTA: no se crea PlatformPlanModule ni PlatformPlanEntitlement.");
  console.log("  NOTA: no se asigna plan a ninguna organización.");
  console.log("");

  if (!gymSnapshot.found || !trustmeSnapshot.found) {
    console.log("❌  EXECUTE ABORTARÍA — falta al menos una de las dos organizaciones requeridas.");
  } else {
    console.log("✅  INSPECT completo. Cero writes realizados. Ambas organizaciones existen — EXECUTE podría aplicar el plan de arriba.");
  }
}

// ── EXECUTE — una sola transacción, idempotente, nunca borra ───────

async function runExecute() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(" bootstrap-platform-commercial-catalog — MODO EXECUTE");
  console.log("═══════════════════════════════════════════════════════════\n");
  printConnectionFingerprint();

  assertCatalogConsistency();

  await prisma.$transaction(async (tx) => {
    // 1. Localizar AMBAS organizaciones primero — si falta cualquiera,
    //    abortar toda la transacción (rollback total, cero writes).
    const gymOrg = await tx.platformOrganization.findUnique({ where: { code: TARGET_ORG_CODES.GYM } });
    if (!gymOrg) {
      throw new Error(`ABORT: no existe la organización "${TARGET_ORG_CODES.GYM}". No se crea — corregir manualmente primero.`);
    }
    const trustmeOrg = await tx.platformOrganization.findUnique({ where: { code: TARGET_ORG_CODES.TRUSTME } });
    if (!trustmeOrg) {
      throw new Error(`ABORT: no existe la organización "${TARGET_ORG_CODES.TRUSTME}". No se crea — corregir manualmente primero.`);
    }

    // 2. Catálogo — verticales, planes base, módulos, entitlement definitions.
    console.log("  → Verticales...");
    for (const v of VERTICALS) {
      await tx.platformVertical.upsert({
        where: { code: v.code },
        update: { name: v.name, description: v.description },
        create: { code: v.code, name: v.name, description: v.description, is_active: true },
      });
    }

    console.log("  → Planes base (sin composición)...");
    // FASE V-C — solo en catálogo de planes vacío (ver shouldSeedBasePlans).
    const existingPlanCount = await tx.platformPlan.count();
    if (!shouldSeedBasePlans(existingPlanCount)) {
      console.log(`    (omitido — ya existen ${existingPlanCount} planes; se gestionan desde Platform Admin)`);
    }
    for (const p of shouldSeedBasePlans(existingPlanCount) ? PLANS : []) {
      await tx.platformPlan.upsert({
        where: { code: p.code },
        update: { name: p.name, description: p.description },
        create: {
          code: p.code, name: p.name, description: p.description,
          billing_cycle: "MONTHLY",
          price_monthly: p.price_monthly ?? null,
          price_annual: p.price_annual ?? null,
          max_locations: p.max_locations ?? null,
          max_users: p.max_users ?? null,
          is_active: true,
        },
      });
    }

    console.log("  → Módulos...");
    const verticalRows = await tx.platformVertical.findMany({ select: { id: true, code: true } });
    const verticalIdByCode = new Map(verticalRows.map((v) => [v.code, v.id]));
    for (const m of MODULES) {
      const vertical_id = m.vertical_code ? (verticalIdByCode.get(m.vertical_code) ?? null) : null;
      await tx.platformModule.upsert({
        where: { code: m.code },
        update: { name: m.name, category: m.category, is_core: m.is_core, vertical_id },
        create: { code: m.code, name: m.name, category: m.category, status: "AVAILABLE", version: "1.0", is_core: m.is_core, vertical_id },
      });
    }

    console.log("  → Entitlement definitions...");
    for (const e of ENTITLEMENT_DEFINITIONS) {
      await tx.platformEntitlementDefinition.upsert({
        where: { code: e.code },
        update: { name: e.name, category: e.category, period_type: e.period },
        create: { code: e.code, name: e.name, category: e.category, value_type: "COUNT", period_type: e.period, is_active: true },
      });
    }

    const moduleRows = await tx.platformModule.findMany({ select: { id: true, code: true } });
    const moduleIdByCode = new Map(moduleRows.map((m) => [m.code, m.id]));
    const entitlementRows = await tx.platformEntitlementDefinition.findMany({ select: { id: true, code: true } });
    const entitlementIdByCode = new Map(entitlementRows.map((e) => [e.code, e.id]));

    // 3. gym-0001 — vertical GYM, 15 módulos, 4 overrides Unlimited. plan_id intocado.
    console.log(`  → ${TARGET_ORG_CODES.GYM} — vertical...`);
    const gymVerticalId = verticalIdByCode.get("GYM");
    if (!gymVerticalId) throw new Error('ABORT: la vertical "GYM" no quedó sembrada — no se puede asignar a gym-0001.');
    if (gymOrg.vertical_id !== gymVerticalId) {
      await tx.platformOrganization.update({ where: { id: gymOrg.id }, data: { vertical_id: gymVerticalId } });
    }

    console.log(`  → ${TARGET_ORG_CODES.GYM} — módulos (15)...`);
    await upsertOrganizationModules(tx, gymOrg.id, GYM_MODULE_CODES, moduleIdByCode);

    console.log(`  → ${TARGET_ORG_CODES.GYM} — overrides Unlimited transitorios...`);
    await upsertUnlimitedOverrides(tx, gymOrg.id, UNLIMITED_ENTITLEMENT_CODES, entitlementIdByCode);

    // 4. trustme-0001 — SIN vertical, 11 módulos transversales, 4 overrides Unlimited. plan_id intocado.
    console.log(`  → ${TARGET_ORG_CODES.TRUSTME} — módulos (11, sin gym.*)...`);
    await upsertOrganizationModules(tx, trustmeOrg.id, TRUSTME_MODULE_CODES, moduleIdByCode);

    console.log(`  → ${TARGET_ORG_CODES.TRUSTME} — overrides Unlimited transitorios...`);
    await upsertUnlimitedOverrides(tx, trustmeOrg.id, UNLIMITED_ENTITLEMENT_CODES, entitlementIdByCode);
  }, { timeout: 30000 });

  console.log("\n✅  EXECUTE completado. Catálogo sembrado, ambas organizaciones configuradas, plan_id sin cambios.");
}

async function upsertOrganizationModules(
  tx: Prisma.TransactionClient,
  organizationId: string,
  desiredCodes: readonly string[],
  moduleIdByCode: Map<string, string>,
) {
  for (const code of desiredCodes) {
    const moduleId = moduleIdByCode.get(code);
    if (!moduleId) {
      console.warn(`    ⚠️  Módulo "${code}" no encontrado en catálogo tras sembrarlo — omitido (no debería ocurrir).`);
      continue;
    }
    await tx.platformOrganizationModule.upsert({
      where: { organization_id_module_id: { organization_id: organizationId, module_id: moduleId } },
      update: { is_active: true },
      create: { organization_id: organizationId, module_id: moduleId, is_active: true, activated_at: new Date() },
    });
  }
}

async function upsertUnlimitedOverrides(
  tx: Prisma.TransactionClient,
  organizationId: string,
  desiredCodes: readonly string[],
  entitlementIdByCode: Map<string, string>,
) {
  for (const code of desiredCodes) {
    const entitlementId = entitlementIdByCode.get(code);
    if (!entitlementId) {
      console.warn(`    ⚠️  Entitlement "${code}" no encontrado en catálogo tras sembrarlo — omitido (no debería ocurrir).`);
      continue;
    }
    const existing = await tx.platformOrganizationEntitlementOverride.findUnique({
      where: { organization_id_entitlement_definition_id: { organization_id: organizationId, entitlement_definition_id: entitlementId } },
    });
    if (!existing) {
      await tx.platformOrganizationEntitlementOverride.create({
        data: { organization_id: organizationId, entitlement_definition_id: entitlementId, is_unlimited: true, numeric_value: null },
      });
    } else if (existing.is_unlimited === true && existing.numeric_value === null) {
      // Ya correcto — no-op idempotente, no se re-escribe.
    } else {
      console.warn(
        `    ⚠️  Override "${code}" ya existe con otra configuración (is_unlimited=${existing.is_unlimited}, numeric_value=${existing.numeric_value}) — NO se sobrescribe. Requiere revisión manual.`,
      );
    }
  }
}

// ── main ─────────────────────────────────────────────────────────────

async function main() {
  const mode = resolveMode();
  if (mode === "INSPECT") {
    await runInspect();
  } else {
    await runExecute();
  }
}

main()
  .catch((err) => {
    console.error("\n❌  Error durante el bootstrap comercial:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
