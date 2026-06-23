// ─────────────────────────────────────────────────────────────────
// platform — database-remediation-planner.ts
//
// Planner read-only de acciones recomendadas para una base cliente.
// Convierte el resultado del preflight en una lista ordenada de
// recomendaciones clasificadas por tipo, riesgo y estado.
//
// Reglas estrictas:
// - Función PURA. Sin async. Sin DB. Sin efectos secundarios.
// - No ejecuta seeds, migraciones ni configuraciones.
// - No escribe datos. No modifica el Prisma singleton.
// - Solo transforma el resultado del preflight en un plan legible.
// ─────────────────────────────────────────────────────────────────

import type {
  DatabasePreflightResult,
  DatabaseRemediationItem,
  DatabaseRemediationPlan,
  DatabaseRemediationPlanStatus,
  DatabaseRemediationPlanSummary,
  DatabaseRemediationActionType,
  DatabaseRemediationRisk,
  DatabaseRemediationStatus,
} from "../types/platform.types";

// ── Regla interna de remediación ─────────────────────────────────

interface RemediationRule {
  title:                string;
  description:          string;
  actionType:           DatabaseRemediationActionType;
  risk:                 DatabaseRemediationRisk;
  status:               DatabaseRemediationStatus;
  recommendedOrder:     number;
  canBeAutomatedLater:  boolean;
  requiresConfirmation: boolean;
  requiresBackupInProd: boolean;
  notes?:               string[];
}

// ── Tabla de reglas por código de check ──────────────────────────
// Solo se generan items para checks no-PASS.
// Para PASS, el check no llega al planner.

const REMEDIATION_RULES: Record<string, RemediationRule> = {

  // ── Errores catastróficos de schema ─────────────────────────────

  GLOBAL_SCHEMA_ERROR: {
    title:                "Error crítico de schema en la base objetivo",
    description:          "El schema de la base de datos está incompleto o desactualizado. No se puede evaluar ninguna otra acción.",
    actionType:           "MANUAL_REVIEW",
    risk:                 "HIGH",
    status:               "BLOCKED",
    recommendedOrder:     0,
    canBeAutomatedLater:  false,
    requiresConfirmation: true,
    requiresBackupInProd: true,
    notes:                ["Verificar que las migraciones Prisma estén aplicadas en esta base."],
  },

  TENANT_SCHEMA_ERROR: {
    title:                "Error crítico de schema al leer datos del tenant",
    description:          "No se pudieron leer tablas de tenant (Gym, Branch, User, TaxRate, ProductCategory, TenantFiscalConfig, CashRegister).",
    actionType:           "MANUAL_REVIEW",
    risk:                 "HIGH",
    status:               "BLOCKED",
    recommendedOrder:     0,
    canBeAutomatedLater:  false,
    requiresConfirmation: true,
    requiresBackupInProd: true,
    notes:                ["Verificar que las migraciones Prisma estén aplicadas en la base objetivo."],
  },

  TENANT_DTE_SCHEMA_ERROR: {
    title:                "Error crítico de schema DTE",
    description:          "No se pudieron leer las tablas DTE. El schema puede estar desactualizado.",
    actionType:           "MANUAL_REVIEW",
    risk:                 "HIGH",
    status:               "BLOCKED",
    recommendedOrder:     0,
    canBeAutomatedLater:  false,
    requiresConfirmation: true,
    requiresBackupInProd: true,
    notes:                ["Verificar que las tablas DteIssuerConfig, DteCorrelative y DteCredential existan en la base objetivo."],
  },

  // ── Catálogos globales — SEED ────────────────────────────────────

  GLOBAL_DTE_CATALOG_ITEMS: {
    title:                "Cargar catálogos DTE requeridos",
    description:          "Faltan ítems activos en uno o más catálogos DTE (CAT-001, CAT-002, CAT-016, CAT-017, CAT-018, CAT-022, CAT-024).",
    actionType:           "SEED",
    risk:                 "LOW",
    status:               "RECOMMENDED",
    recommendedOrder:     2,
    canBeAutomatedLater:  true,
    requiresConfirmation: true,
    requiresBackupInProd: false,
    notes:                ["El seed debe ser idempotente (upsert). Seguro de re-ejecutar."],
  },

  GLOBAL_UNITS_MIN: {
    title:                "Cargar unidades de medida",
    description:          "No hay unidades de medida activas. Requeridas para productos y documentos fiscales.",
    actionType:           "SEED",
    risk:                 "LOW",
    status:               "RECOMMENDED",
    recommendedOrder:     3,
    canBeAutomatedLater:  true,
    requiresConfirmation: true,
    requiresBackupInProd: false,
  },

  GLOBAL_ID_TYPES: {
    title:                "Cargar tipos de identificación",
    description:          "No hay tipos de identificación activos. Requeridos para clientes y proveedores fiscales.",
    actionType:           "SEED",
    risk:                 "LOW",
    status:               "RECOMMENDED",
    recommendedOrder:     4,
    canBeAutomatedLater:  true,
    requiresConfirmation: true,
    requiresBackupInProd: false,
  },

  GLOBAL_ECONOMIC_ACTIVITIES: {
    title:                "Cargar actividades económicas",
    description:          "No hay actividades económicas registradas. Requeridas para configuración fiscal del emisor DTE.",
    actionType:           "SEED",
    risk:                 "LOW",
    status:               "RECOMMENDED",
    recommendedOrder:     5,
    canBeAutomatedLater:  true,
    requiresConfirmation: true,
    requiresBackupInProd: false,
  },

  GLOBAL_MUNICIPALITIES: {
    title:                "Cargar municipios",
    description:          "No hay municipios registrados. Requeridos para direcciones fiscales y configuración de emisores DTE.",
    actionType:           "SEED",
    risk:                 "LOW",
    status:               "RECOMMENDED",
    recommendedOrder:     6,
    canBeAutomatedLater:  true,
    requiresConfirmation: true,
    requiresBackupInProd: false,
  },

  GLOBAL_COUNTRIES: {
    title:                "Cargar países",
    description:          "No hay países registrados. Requeridos para catálogos base.",
    actionType:           "SEED",
    risk:                 "LOW",
    status:               "RECOMMENDED",
    recommendedOrder:     7,
    canBeAutomatedLater:  true,
    requiresConfirmation: true,
    requiresBackupInProd: false,
  },

  GLOBAL_GYM_GOALS: {
    title:                "Cargar objetivos (Goals) para vertical GYM",
    description:          "Vertical GYM activa pero no hay goals activos. Requeridos para planes semanales y membresías.",
    actionType:           "SEED",
    risk:                 "LOW",
    status:               "RECOMMENDED",
    recommendedOrder:     8,
    canBeAutomatedLater:  true,
    requiresConfirmation: true,
    requiresBackupInProd: false,
  },

  GLOBAL_GYM_SPORTS: {
    title:                "Cargar deportes (Sports) para vertical GYM",
    description:          "Vertical GYM activa pero no hay sports activos. Requeridos para planes semanales.",
    actionType:           "SEED",
    risk:                 "LOW",
    status:               "RECOMMENDED",
    recommendedOrder:     9,
    canBeAutomatedLater:  true,
    requiresConfirmation: true,
    requiresBackupInProd: false,
  },

  // ── Catálogos Platform — NOT_APPLICABLE en base cliente ──────────
  // En CLIENT_RUNTIME los módulos/verticales/planes viven en
  // la base control plane, no en la base runtime cliente.

  GLOBAL_PLATFORM_MODULES: {
    title:                "Catálogos Platform (módulos) — no requeridos en base cliente",
    description:          "Los módulos de plataforma viven en la base control plane, no en bases runtime cliente. Esta advertencia es informativa.",
    actionType:           "NONE",
    risk:                 "LOW",
    status:               "NOT_APPLICABLE",
    recommendedOrder:     100,
    canBeAutomatedLater:  false,
    requiresConfirmation: false,
    requiresBackupInProd: false,
  },

  GLOBAL_PLATFORM_VERTICALS: {
    title:                "Catálogos Platform (verticales) — no requeridos en base cliente",
    description:          "Las verticales de plataforma viven en la base control plane, no en bases runtime cliente.",
    actionType:           "NONE",
    risk:                 "LOW",
    status:               "NOT_APPLICABLE",
    recommendedOrder:     101,
    canBeAutomatedLater:  false,
    requiresConfirmation: false,
    requiresBackupInProd: false,
  },

  GLOBAL_PLATFORM_PLANS: {
    title:                "Catálogos Platform (planes) — no requeridos en base cliente",
    description:          "Los planes de plataforma viven en la base control plane, no en bases runtime cliente.",
    actionType:           "NONE",
    risk:                 "LOW",
    status:               "NOT_APPLICABLE",
    recommendedOrder:     102,
    canBeAutomatedLater:  false,
    requiresConfirmation: false,
    requiresBackupInProd: false,
  },

  // ── Migración estructural diferida ───────────────────────────────

  GLOBAL_UNITS_NO_MH_CODE: {
    title:                "Agregar mh_code a unidades de medida",
    description:          "UnitOfMeasure no tiene campo 'mh_code' ni 'code'. El código CAT-014 queda solo en el seed sin campo fiscal separado.",
    actionType:           "MIGRATION",
    risk:                 "MEDIUM",
    status:               "DEFERRED",
    recommendedOrder:     60,
    canBeAutomatedLater:  false,
    requiresConfirmation: true,
    requiresBackupInProd: true,
    notes:                ["Diferido hasta que se requiera validación fiscal por código en UnitOfMeasure."],
  },

  // ── Tenant — configuración y datos base ──────────────────────────

  TENANT_ID_MISSING: {
    title:                "Asignar tenant_id a la organización",
    description:          "PlatformOrganization no tiene tenant_id configurado. Los checks de tenant no se pueden ejecutar.",
    actionType:           "CONFIGURATION",
    risk:                 "MEDIUM",
    status:               "RECOMMENDED",
    recommendedOrder:     11,
    canBeAutomatedLater:  false,
    requiresConfirmation: true,
    requiresBackupInProd: false,
    notes:                ["Configurar el campo tenant_id en la organización desde Platform Admin."],
  },

  TENANT_EXISTS: {
    title:                "Corregir o crear el tenant (Gym) en la base cliente",
    description:          "No se encontró un Gym con el tenant_id de la organización, o su estado no es 'active'.",
    actionType:           "MANUAL_REVIEW",
    risk:                 "HIGH",
    status:               "RECOMMENDED",
    recommendedOrder:     10,
    canBeAutomatedLater:  false,
    requiresConfirmation: true,
    requiresBackupInProd: true,
    notes:                ["Verificar que PlatformOrganization.tenant_id coincide con un Gym.id existente y activo en la base cliente."],
  },

  TENANT_LOCATION_EXISTS: {
    title:                "Crear al menos una sucursal activa",
    description:          "No hay sucursales activas para este tenant. Requerido para operar.",
    actionType:           "CONFIGURATION",
    risk:                 "MEDIUM",
    status:               "RECOMMENDED",
    recommendedOrder:     12,
    canBeAutomatedLater:  true,
    requiresConfirmation: true,
    requiresBackupInProd: false,
  },

  TENANT_ADMIN_USER: {
    title:                "Crear usuario administrador activo",
    description:          "No hay usuarios con rol super_admin o branch_admin activos en este tenant.",
    actionType:           "SEED",
    risk:                 "MEDIUM",
    status:               "RECOMMENDED",
    recommendedOrder:     13,
    canBeAutomatedLater:  true,
    requiresConfirmation: true,
    requiresBackupInProd: false,
    notes:                ["El usuario inicial puede crearse via seed base o manualmente desde el módulo de usuarios."],
  },

  TENANT_TAX_RATE: {
    title:                "Cargar tasas de impuesto",
    description:          "commerce.products activo pero no hay tasas de impuesto configuradas (ej: IVA 13%).",
    actionType:           "SEED",
    risk:                 "LOW",
    status:               "RECOMMENDED",
    recommendedOrder:     14,
    canBeAutomatedLater:  true,
    requiresConfirmation: true,
    requiresBackupInProd: false,
  },

  TENANT_PRODUCT_CATEGORY: {
    title:                "Cargar categorías de producto",
    description:          "commerce.products activo pero no hay categorías de producto activas.",
    actionType:           "SEED",
    risk:                 "LOW",
    status:               "RECOMMENDED",
    recommendedOrder:     15,
    canBeAutomatedLater:  true,
    requiresConfirmation: true,
    requiresBackupInProd: false,
  },

  TENANT_FISCAL_CONFIG: {
    title:                "Crear configuración fiscal del tenant",
    description:          "No existe TenantFiscalConfig para este tenant. Requerida para emitir documentos DTE.",
    actionType:           "CONFIGURATION",
    risk:                 "MEDIUM",
    status:               "RECOMMENDED",
    recommendedOrder:     20,
    canBeAutomatedLater:  true,
    requiresConfirmation: true,
    requiresBackupInProd: false,
  },

  TENANT_CASH_REGISTER: {
    title:                "Crear caja registradora activa",
    description:          "commerce.cash activo pero no hay cajas registradoras activas.",
    actionType:           "CONFIGURATION",
    risk:                 "MEDIUM",
    status:               "RECOMMENDED",
    recommendedOrder:     21,
    canBeAutomatedLater:  true,
    requiresConfirmation: true,
    requiresBackupInProd: false,
  },

  // ── Seguridad y DTE ───────────────────────────────────────────────

  TENANT_DTE_ENCRYPTION_KEY: {
    title:                "Configurar clave de cifrado de credenciales DTE",
    description:          "PLATFORM_ENCRYPTION_KEY no está configurada o no tiene 32 bytes en base64. Las credenciales DTE no pueden cifrarse ni descifrarse.",
    actionType:           "SECURITY",
    risk:                 "CRITICAL",
    status:               "RECOMMENDED",
    recommendedOrder:     25,
    canBeAutomatedLater:  false,
    requiresConfirmation: false,
    requiresBackupInProd: false,
    notes: [
      "Generar con: openssl rand -base64 32",
      "Configurar como PLATFORM_ENCRYPTION_KEY en el entorno (.env).",
      "Sin esta clave, DTE no puede operar de forma segura.",
    ],
  },

  TENANT_DTE_CREDENTIAL_ENCRYPTION: {
    title:                "Cifrar credenciales DTE existentes",
    description:          "Hay DteCredential(s) activas sin encrypted_payload ni secret_ref. Operan sin cifrado.",
    actionType:           "SECURITY",
    risk:                 "HIGH",
    status:               "RECOMMENDED",
    recommendedOrder:     26,
    canBeAutomatedLater:  true,
    requiresConfirmation: true,
    requiresBackupInProd: true,
    notes:                ["Ejecutar encryptDteCredentialPayload en las credenciales pendientes antes de operar en producción."],
  },

  TENANT_DTE_ISSUER_CONFIG: {
    title:                "Configurar emisor DTE",
    description:          "fiscal.dte activo pero no hay DteIssuerConfig activa para este tenant.",
    actionType:           "CONFIGURATION",
    risk:                 "HIGH",
    status:               "RECOMMENDED",
    recommendedOrder:     30,
    canBeAutomatedLater:  false,
    requiresConfirmation: true,
    requiresBackupInProd: false,
    notes:                ["Configurar el emisor DTE desde /dashboard/dte/config."],
  },

  TENANT_DTE_CORRELATIVE: {
    title:                "Inicializar correlativos DTE para el año en curso",
    description:          "fiscal.dte activo pero no hay DteCorrelative para el año actual.",
    actionType:           "CONFIGURATION",
    risk:                 "HIGH",
    status:               "RECOMMENDED",
    recommendedOrder:     31,
    canBeAutomatedLater:  false,
    requiresConfirmation: true,
    requiresBackupInProd: false,
    notes:                ["Los correlativos deben inicializarse desde la configuración DTE."],
  },
};

// ── Motor del planner ─────────────────────────────────────────────

export interface DatabaseRemediationPlannerOptions {
  isProductionEnvironment?: boolean;
}

export function buildDatabaseRemediationPlan(
  result: DatabasePreflightResult,
  options?: DatabaseRemediationPlannerOptions,
): DatabaseRemediationPlan {
  const isProduction = options?.isProductionEnvironment ?? false;
  const items: DatabaseRemediationItem[] = [];

  for (const check of result.checks) {
    // Solo checks no-PASS generan recomendaciones
    if (check.status === "PASS") continue;

    const rule = REMEDIATION_RULES[check.code];
    if (!rule) continue;

    items.push({
      code:                 `REM_${check.code}`,
      title:                rule.title,
      description:          rule.description,
      actionType:           rule.actionType,
      risk:                 rule.risk,
      status:               rule.status,
      sourceCheckCode:      check.code,
      recommendedOrder:     rule.recommendedOrder,
      canBeAutomatedLater:  rule.canBeAutomatedLater,
      requiresConfirmation: rule.requiresConfirmation,
      requiresBackup:       isProduction && rule.requiresBackupInProd,
      notes:                rule.notes,
    });
  }

  // Ordenar por prioridad (menor = más urgente)
  items.sort((a, b) => a.recommendedOrder - b.recommendedOrder);

  const summary: DatabaseRemediationPlanSummary = {
    seeds:          items.filter((i) => i.actionType === "SEED").length,
    migrations:     items.filter((i) => i.actionType === "MIGRATION").length,
    configurations: items.filter((i) =>
      i.actionType === "CONFIGURATION" || i.actionType === "SECURITY",
    ).length,
    manualReviews:  items.filter((i) => i.actionType === "MANUAL_REVIEW").length,
    highRisk:       items.filter((i) => i.risk === "HIGH" || i.risk === "CRITICAL").length,
  };

  // Derivar estado del plan a partir de items accionables
  const actionable = items.filter(
    (i) => i.status !== "NOT_APPLICABLE" && i.status !== "DEFERRED",
  );

  const hasCritical = actionable.some((i) => i.risk === "CRITICAL");
  const hasBlocked  = actionable.some((i) => i.status === "BLOCKED");

  let status: DatabaseRemediationPlanStatus;
  if (hasCritical || hasBlocked) {
    status = "CRITICAL_ACTIONS_REQUIRED";
  } else if (actionable.length > 0) {
    status = "ACTIONS_RECOMMENDED";
  } else {
    status = "NO_ACTION_NEEDED";
  }

  return { status, items, summary };
}
