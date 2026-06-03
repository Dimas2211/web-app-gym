/**
 * seed.platform.ts
 *
 * Seeds del dominio Platform (Etapa 16C):
 *   1. PlatformVertical  — verticales de industria
 *   2. PlatformPlan      — planes de licencia
 *   3. PlatformModule    — catálogo de módulos disponibles
 *   4. PlatformOrganization — organización inicial (la instancia GYM activa)
 *   5. PlatformOrganizationModule — módulos activos de la organización inicial
 *
 * Idempotente: usa upsert en todos los registros.
 * No modifica tablas del ERP runtime.
 */

import { PrismaClient } from "@prisma/client";

// ── Constantes de catálogo ────────────────────────────────────────

const VERTICALS = [
  { code: "GYM",        name: "Gimnasio",              description: "Gestión de membresías, clases y entrenadores" },
  { code: "RETAIL",     name: "Retail / Comercio",     description: "Punto de venta y gestión comercial" },
  { code: "CLINIC",     name: "Clínica / Salud",       description: "Gestión de pacientes, citas y expedientes médicos" },
  { code: "VETERINARY", name: "Veterinaria",           description: "Gestión de pacientes animales y consultas veterinarias" },
  { code: "GENERAL",    name: "General",               description: "Vertical genérica para negocios sin categoría específica" },
] as const;

const PLANS = [
  {
    code:          "starter",
    name:          "Starter",
    description:   "Plan inicial para negocios pequeños. Funcionalidades core incluidas.",
    price_monthly: 29.99,
    price_annual:  299.99,
    max_locations: 1,
    max_users:     5,
  },
  {
    code:          "professional",
    name:          "Professional",
    description:   "Plan para negocios en crecimiento. Commerce y módulos verticales incluidos.",
    price_monthly: 79.99,
    price_annual:  799.99,
    max_locations: 3,
    max_users:     20,
  },
  {
    code:          "enterprise",
    name:          "Enterprise",
    description:   "Plan sin límites. Todas las funcionalidades disponibles. SLA garantizado.",
    price_monthly: null,
    price_annual:  null,
    max_locations: null,
    max_users:     null,
  },
] as const;

// Catálogo de módulos — uno por funcionalidad identificada
const MODULES = [
  // Core — transversales, base de toda instancia
  { code: "core.users",       name: "Usuarios",          category: "CORE"     as const, is_core: true,  vertical_code: null },
  { code: "core.roles",       name: "Roles y permisos",  category: "CORE"     as const, is_core: true,  vertical_code: null },
  { code: "core.locations",   name: "Sucursales",        category: "CORE"     as const, is_core: true,  vertical_code: null },
  { code: "core.customers",   name: "Clientes / Contactos", category: "CORE"  as const, is_core: false, vertical_code: null },

  // Commerce — transversales de negocio
  { code: "commerce.products",  name: "Catálogo de productos", category: "COMMERCE" as const, is_core: false, vertical_code: null },
  { code: "commerce.inventory", name: "Inventario",            category: "COMMERCE" as const, is_core: false, vertical_code: null },
  { code: "commerce.suppliers", name: "Proveedores",           category: "COMMERCE" as const, is_core: false, vertical_code: null },
  { code: "commerce.purchases", name: "Compras",               category: "COMMERCE" as const, is_core: false, vertical_code: null },
  { code: "commerce.sales",     name: "Ventas",                category: "COMMERCE" as const, is_core: false, vertical_code: null },
  { code: "commerce.cash",      name: "Caja",                  category: "COMMERCE" as const, is_core: false, vertical_code: null },

  // Fiscal
  { code: "fiscal.dte",         name: "DTE / Facturación electrónica", category: "INTEGRATION" as const, is_core: false, vertical_code: null },

  // Vertical GYM
  { code: "gym.memberships",  name: "Membresías",          category: "VERTICAL" as const, is_core: false, vertical_code: "GYM" },
  { code: "gym.trainers",     name: "Entrenadores",        category: "VERTICAL" as const, is_core: false, vertical_code: "GYM" },
  { code: "gym.classes",      name: "Clases",              category: "VERTICAL" as const, is_core: false, vertical_code: "GYM" },
  { code: "gym.weekly_plans", name: "Planes semanales",    category: "VERTICAL" as const, is_core: false, vertical_code: "GYM" },
] as const;

// Módulos activos en la organización GYM inicial — todos los operativos actuales
const GYM_ORG_ACTIVE_MODULES = [
  "core.users",
  "core.roles",
  "core.locations",
  "core.customers",
  "commerce.products",
  "commerce.inventory",
  "commerce.suppliers",
  "commerce.purchases",
  "commerce.sales",
  "commerce.cash",
  "fiscal.dte",
  "gym.memberships",
  "gym.trainers",
  "gym.classes",
  "gym.weekly_plans",
];

// ── Función exportada ─────────────────────────────────────────────

export async function seedPlatform(prisma: PrismaClient): Promise<void> {
  console.log("\n🏗️  Platform — verticales, planes, módulos y organización inicial...");

  // ── 1. Verticales ─────────────────────────────────────────────
  console.log("  → Verticales...");
  for (const v of VERTICALS) {
    await prisma.platformVertical.upsert({
      where:  { code: v.code },
      update: { name: v.name, description: v.description },
      create: { code: v.code, name: v.name, description: v.description, is_active: true },
    });
  }

  // ── 2. Planes ────────────────────────────────────────────────
  console.log("  → Planes de licencia...");
  for (const p of PLANS) {
    await prisma.platformPlan.upsert({
      where:  { code: p.code },
      update: { name: p.name, description: p.description },
      create: {
        code:          p.code,
        name:          p.name,
        description:   p.description,
        billing_cycle: "MONTHLY",
        price_monthly: p.price_monthly ?? null,
        price_annual:  p.price_annual  ?? null,
        max_locations: p.max_locations ?? null,
        max_users:     p.max_users     ?? null,
        is_active:     true,
      },
    });
  }

  // ── 3. Módulos ───────────────────────────────────────────────
  console.log("  → Catálogo de módulos...");

  // Precarga mapa vertical code → id
  const verticalMap: Record<string, string> = {};
  const verticals = await prisma.platformVertical.findMany({ select: { id: true, code: true } });
  for (const v of verticals) verticalMap[v.code] = v.id;

  for (const m of MODULES) {
    const vertical_id = m.vertical_code ? (verticalMap[m.vertical_code] ?? null) : null;
    await prisma.platformModule.upsert({
      where:  { code: m.code },
      update: { name: m.name, category: m.category, is_core: m.is_core, vertical_id },
      create: {
        code:        m.code,
        name:        m.name,
        category:    m.category,
        status:      "AVAILABLE",
        version:     "1.0",
        is_core:     m.is_core,
        vertical_id,
      },
    });
  }

  // ── 4. Organización inicial (instancia GYM activa) ───────────
  console.log("  → Organización inicial (GYM)...");

  const gymVertical = await prisma.platformVertical.findUnique({ where: { code: "GYM" } });
  const professionalPlan = await prisma.platformPlan.findUnique({ where: { code: "professional" } });

  // tenant_id de la instancia GYM activa — se toma del gym.slug real.
  // En producción este campo se alineará cuando el super_admin complete el provisioning.
  // Por ahora se registra con un valor reconocible de la instancia demo.
  const gymOrg = await prisma.platformOrganization.upsert({
    where:  { code: "gym-sv-main" },
    update: {
      name:          "GYM El Salvador — Instancia Principal",
      vertical_id:   gymVertical?.id ?? null,
      plan_id:       professionalPlan?.id ?? null,
      status:        "ACTIVE",
      license_status: "ACTIVE",
      billing_cycle: "MONTHLY",
      country_code:  "SV",
      timezone:      "America/El_Salvador",
    },
    create: {
      code:           "gym-sv-main",
      name:           "GYM El Salvador — Instancia Principal",
      legal_name:     null,
      nit:            null,
      tenant_id:      null,  // se vincula manualmente en provisioning
      vertical_id:    gymVertical?.id ?? null,
      plan_id:        professionalPlan?.id ?? null,
      status:         "ACTIVE",
      license_status: "ACTIVE",
      billing_cycle:  "MONTHLY",
      country_code:   "SV",
      timezone:       "America/El_Salvador",
      domain:         null,
      logo_url:       null,
    },
  });

  // ── 5. Módulos activos de la organización inicial ────────────
  console.log("  → Módulos activos de la organización GYM...");

  const moduleMap: Record<string, string> = {};
  const allModules = await prisma.platformModule.findMany({ select: { id: true, code: true } });
  for (const mod of allModules) moduleMap[mod.code] = mod.id;

  for (const moduleCode of GYM_ORG_ACTIVE_MODULES) {
    const moduleId = moduleMap[moduleCode];
    if (!moduleId) {
      console.warn(`    ⚠️  Módulo "${moduleCode}" no encontrado en catálogo — omitido`);
      continue;
    }
    await prisma.platformOrganizationModule.upsert({
      where: {
        organization_id_module_id: {
          organization_id: gymOrg.id,
          module_id:       moduleId,
        },
      },
      update: { is_active: true },
      create: {
        organization_id: gymOrg.id,
        module_id:       moduleId,
        is_active:       true,
        activated_at:    new Date(),
      },
    });
  }

  // ── 6. Branding inicial (vacío) ──────────────────────────────
  await prisma.platformBranding.upsert({
    where:  { organization_id: gymOrg.id },
    update: {},
    create: { organization_id: gymOrg.id },
  });

  // ── 7. Log de deployment inicial ────────────────────────────
  const existingLog = await prisma.platformDeploymentLog.findFirst({
    where: { organization_id: gymOrg.id, action: "INITIAL_SEED" },
  });
  if (!existingLog) {
    await prisma.platformDeploymentLog.create({
      data: {
        organization_id: gymOrg.id,
        action:          "INITIAL_SEED",
        status:          "SUCCESS",
        notes:           "Seed inicial de la plataforma — Etapa 16C",
        metadata:        { modules_activated: GYM_ORG_ACTIVE_MODULES.length },
        started_at:      new Date(),
        ended_at:        new Date(),
      },
    });
  }

  console.log("  ✅  Platform seed completado.");
}
