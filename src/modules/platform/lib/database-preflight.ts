// ─────────────────────────────────────────────────────────────────
// platform — database-preflight.ts
//
// Preflight validator de base de datos operativa.
// Verifica que catálogos, seeds y datos mínimos estén presentes.
// Función async server-side — NUNCA escribe datos.
// Solo usa: count, findUnique, findFirst.
//
// Acepta un PrismaClient externo via options.prismaClient para
// ejecutar checks contra bases de datos dinámicas (C3).
// Si no se pasa, usa el singleton normal de la app.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { PLATFORM_MODULE_CODES } from "../constants/platform-modules.constants";
import type {
  DatabasePreflightInput,
  DatabasePreflightResult,
  DatabasePreflightStatus,
  DatabasePreflightTargetType,
  PreflightCheckItem,
  PreflightCheckScope,
  PreflightCheckSeverity,
} from "../types/platform.types";

// ── Helper de errores de schema para bases dinámicas ─────────────
// Solo se usa cuando se ejecuta contra un PrismaClient externo.
// Evita filtrar connection strings en mensajes de error.

function extractSafeCheckError(err: unknown): string {
  const code = typeof err === "object" && err !== null
    ? (err as { code?: string }).code
    : undefined;

  if (code === "P2021" || code === "P2022") {
    return `Tabla o columna no encontrada en esta base de datos (Prisma ${code}). El schema puede estar incompleto o desactualizado.`;
  }
  if (code === "P2010") {
    return `Error de query en la base de datos objetivo (Prisma ${code}).`;
  }

  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/postgresql:\/\/[^\s"']*/gi, "[redacted]")
    .replace(/postgres:\/\/[^\s"']*/gi,   "[redacted]")
    .replace(/:[^@\s]{1,256}@/g, ":[redacted]@")
    .substring(0, 300);
}

// ── Catálogos DTE requeridos (mínimo un ítem activo de cada uno) ──

const REQUIRED_DTE_CATALOGS = [
  "CAT-001",
  "CAT-002",
  "CAT-016",
  "CAT-017",
  "CAT-018",
  "CAT-022",
  "CAT-024",
] as const;

// Catálogos DTE requeridos solo por FEX 11 (Factura de Exportación).
// FEX 11 es una funcionalidad controlada por feature flag (no un módulo
// de plataforma), por eso este check es WARNING y no BLOCKER: una base
// sin FEX 11 activo no debe fallar el preflight general por esto.
const FEX11_DTE_CATALOGS = [
  "CAT-015",
  "CAT-020",
  "CAT-027",
  "CAT-028",
  "CAT-029",
  "CAT-031",
] as const;

// ── Helpers de construcción de checks ─────────────────────────────

function pass(
  code: string,
  label: string,
  severity: PreflightCheckSeverity,
  scope: PreflightCheckScope,
): PreflightCheckItem {
  return { code, label, severity, scope, status: "PASS", message: "OK", remediation: "" };
}

function fail(
  code: string,
  label: string,
  severity: PreflightCheckSeverity,
  scope: PreflightCheckScope,
  message: string,
  remediation: string,
): PreflightCheckItem {
  return { code, label, severity, scope, status: "FAIL", message, remediation };
}

function warn(
  code: string,
  label: string,
  scope: PreflightCheckScope,
  message: string,
  remediation: string,
): PreflightCheckItem {
  return { code, label, severity: "WARNING", scope, status: "WARN", message, remediation };
}

// ── Checks globales ───────────────────────────────────────────────

async function runGlobalChecks(
  db: PrismaClient,
  targetType: DatabasePreflightTargetType,
): Promise<PreflightCheckItem[]> {
  const checks: PreflightCheckItem[] = [];

  let unitsCount         = 0;
  let idTypesCount       = 0;
  let econActCount       = 0;
  let municipalityCount  = 0;
  let countryCount       = 0;
  let platformModuleCount   = 0;
  let platformVerticalCount = 0;
  let platformPlanCount     = 0;
  let gymVerticalCount      = 0;

  try {
    ([
      unitsCount,
      idTypesCount,
      econActCount,
      municipalityCount,
      countryCount,
      platformModuleCount,
      platformVerticalCount,
      platformPlanCount,
      gymVerticalCount,
    ] = await Promise.all([
      db.unitOfMeasure.count({ where: { status: "active" } }),
      db.identificationType.count({ where: { status: "active" } }),
      db.economicActivity.count({ where: { status: "active" } }),
      db.municipality.count({ where: { status: "active" } }),
      db.country.count({ where: { status: "active" } }),
      db.platformModule.count(),
      db.platformVertical.count({ where: { is_active: true } }),
      db.platformPlan.count({ where: { is_active: true } }),
      db.platformVertical.count({ where: { code: "GYM", is_active: true } }),
    ]));
  } catch (err) {
    checks.push(fail(
      "GLOBAL_SCHEMA_ERROR",
      "Error al leer catálogos globales del schema",
      "BLOCKER",
      "GLOBAL",
      extractSafeCheckError(err),
      "Verificar que el schema de la base de datos objetivo esté actualizado con las migraciones más recientes.",
    ));
    return checks;
  }

  // 1. Unidades de medida
  checks.push(
    unitsCount >= 1
      ? pass("GLOBAL_UNITS_MIN", "Unidades de medida activas", "BLOCKER", "GLOBAL")
      : fail(
          "GLOBAL_UNITS_MIN",
          "Unidades de medida activas",
          "BLOCKER",
          "GLOBAL",
          "No hay unidades de medida activas.",
          "Ejecutar seed con modo 'catalogs', 'base' o 'demo' (seedUnitsOfMeasure).",
        ),
  );

  // 2. Warning estructural — UnitOfMeasure no tiene mh_code/code
  checks.push(
    warn(
      "GLOBAL_UNITS_NO_MH_CODE",
      "Código CAT-014 en unidades de medida",
      "GLOBAL",
      "UnitOfMeasure no tiene campo 'mh_code' ni 'code'. El código oficial CAT-014 queda solo en el seed, no almacenado como campo fiscal separado.",
      "Agregar campo 'mh_code' a UnitOfMeasure en futuras migraciones si se requiere validación fiscal por código.",
    ),
  );

  // 3. Tipos de identificación
  checks.push(
    idTypesCount >= 1
      ? pass("GLOBAL_ID_TYPES", "Tipos de identificación", "BLOCKER", "GLOBAL")
      : fail(
          "GLOBAL_ID_TYPES",
          "Tipos de identificación",
          "BLOCKER",
          "GLOBAL",
          "No hay tipos de identificación activos. Requeridos para clientes y proveedores fiscales.",
          "Ejecutar seed de catálogos DTE (seedDteCatalogItems).",
        ),
  );

  // 4. Actividades económicas
  checks.push(
    econActCount >= 1
      ? pass("GLOBAL_ECONOMIC_ACTIVITIES", "Actividades económicas", "BLOCKER", "GLOBAL")
      : fail(
          "GLOBAL_ECONOMIC_ACTIVITIES",
          "Actividades económicas",
          "BLOCKER",
          "GLOBAL",
          "No hay actividades económicas registradas.",
          "Ejecutar seed de catálogos MH.",
        ),
  );

  // 5. Municipios
  checks.push(
    municipalityCount >= 1
      ? pass("GLOBAL_MUNICIPALITIES", "Municipios", "BLOCKER", "GLOBAL")
      : fail(
          "GLOBAL_MUNICIPALITIES",
          "Municipios",
          "BLOCKER",
          "GLOBAL",
          "No hay municipios registrados. Requerido para direcciones fiscales.",
          "Ejecutar seed de catálogos geográficos.",
        ),
  );

  // 6. Países
  checks.push(
    countryCount >= 1
      ? pass("GLOBAL_COUNTRIES", "Países", "BLOCKER", "GLOBAL")
      : fail(
          "GLOBAL_COUNTRIES",
          "Países",
          "BLOCKER",
          "GLOBAL",
          "No hay países registrados.",
          "Ejecutar seed de catálogos.",
        ),
  );

  // 7. Catálogos DTE requeridos (por cada código)
  try {
    const dteCatalogCounts = await Promise.all(
      REQUIRED_DTE_CATALOGS.map((cat) =>
        db.dteCatalogItem
          .count({ where: { catalog_code: cat, is_active: true } })
          .then((count) => ({ cat, count })),
      ),
    );

    const missingCatalogs = dteCatalogCounts
      .filter(({ count }) => count === 0)
      .map(({ cat }) => cat);

    checks.push(
      missingCatalogs.length === 0
        ? pass("GLOBAL_DTE_CATALOG_ITEMS", "Catálogos DTE requeridos", "BLOCKER", "GLOBAL")
        : fail(
            "GLOBAL_DTE_CATALOG_ITEMS",
            "Catálogos DTE requeridos",
            "BLOCKER",
            "GLOBAL",
            `Faltan ítems activos en: ${missingCatalogs.join(", ")}.`,
            "Ejecutar seedDteCatalogItems con modo 'catalogs', 'base' o 'demo'.",
          ),
    );
  } catch (err) {
    checks.push(fail(
      "GLOBAL_DTE_CATALOG_ITEMS",
      "Catálogos DTE requeridos",
      "BLOCKER",
      "GLOBAL",
      `Error al verificar catálogos DTE: ${extractSafeCheckError(err)}`,
      "Verificar que la tabla DteCatalogItem exista y esté actualizada en la base objetivo.",
    ));
  }

  // 7b. Catálogos DTE requeridos por FEX 11 (WARNING — feature flag, no módulo)
  try {
    const fex11CatalogCounts = await Promise.all(
      FEX11_DTE_CATALOGS.map((cat) =>
        db.dteCatalogItem
          .count({ where: { catalog_code: cat, is_active: true } })
          .then((count) => ({ cat, count })),
      ),
    );

    const missingFex11Catalogs = fex11CatalogCounts
      .filter(({ count }) => count === 0)
      .map(({ cat }) => cat);

    checks.push(
      missingFex11Catalogs.length === 0
        ? pass("GLOBAL_FEX11_CATALOG_ITEMS", "Catálogos FEX 11 (exportación)", "WARNING", "GLOBAL")
        : warn(
            "GLOBAL_FEX11_CATALOG_ITEMS",
            "Catálogos FEX 11 (exportación)",
            "GLOBAL",
            `Faltan ítems activos en: ${missingFex11Catalogs.join(", ")}. Requeridos solo si FEX 11 está habilitado.`,
            "Ejecutar seedDteCatalogItems con modo 'catalogs', 'base' o 'demo'.",
          ),
    );
  } catch (err) {
    checks.push(
      warn(
        "GLOBAL_FEX11_CATALOG_ITEMS",
        "Catálogos FEX 11 (exportación)",
        "GLOBAL",
        `Error al verificar catálogos FEX 11: ${extractSafeCheckError(err)}`,
        "Verificar que la tabla DteCatalogItem exista y esté actualizada en la base objetivo.",
      ),
    );
  }

  // 8–10. Checks platform — BLOCKER solo en CONTROL_PLANE; WARNING en bases cliente/runtime
  // En CLIENT_RUNTIME / DEMO / UNKNOWN los módulos, verticales y planes de plataforma
  // no viven en esta base sino en la base control plane — no deben bloquear.
  const isControlPlane = targetType === "CONTROL_PLANE";
  const platformClientRemediation =
    "Esta base está evaluada como base cliente/runtime. " +
    "Los módulos, verticales y planes de plataforma viven en la base control plane, no aquí.";

  // 8. Módulos de plataforma
  checks.push(
    platformModuleCount >= 1
      ? pass("GLOBAL_PLATFORM_MODULES", "Módulos de plataforma", isControlPlane ? "BLOCKER" : "WARNING", "GLOBAL")
      : isControlPlane
        ? fail(
            "GLOBAL_PLATFORM_MODULES",
            "Módulos de plataforma",
            "BLOCKER",
            "GLOBAL",
            "No hay módulos de plataforma registrados.",
            "Ejecutar seed de plataforma con modo 'base' o 'demo'.",
          )
        : warn(
            "GLOBAL_PLATFORM_MODULES",
            "Módulos de plataforma",
            "GLOBAL",
            "No hay módulos de plataforma registrados en esta base cliente.",
            platformClientRemediation,
          ),
  );

  // 9. Verticales de plataforma
  checks.push(
    platformVerticalCount >= 1
      ? pass("GLOBAL_PLATFORM_VERTICALS", "Verticales de plataforma", isControlPlane ? "BLOCKER" : "WARNING", "GLOBAL")
      : isControlPlane
        ? fail(
            "GLOBAL_PLATFORM_VERTICALS",
            "Verticales de plataforma",
            "BLOCKER",
            "GLOBAL",
            "No hay verticales de plataforma activas.",
            "Ejecutar seed de plataforma con modo 'base' o 'demo'.",
          )
        : warn(
            "GLOBAL_PLATFORM_VERTICALS",
            "Verticales de plataforma",
            "GLOBAL",
            "No hay verticales de plataforma activas en esta base cliente.",
            platformClientRemediation,
          ),
  );

  // 10. Planes de plataforma
  checks.push(
    platformPlanCount >= 1
      ? pass("GLOBAL_PLATFORM_PLANS", "Planes de plataforma", isControlPlane ? "BLOCKER" : "WARNING", "GLOBAL")
      : isControlPlane
        ? fail(
            "GLOBAL_PLATFORM_PLANS",
            "Planes de plataforma",
            "BLOCKER",
            "GLOBAL",
            "No hay planes de plataforma activos.",
            "Ejecutar seed de plataforma con modo 'base' o 'demo'.",
          )
        : warn(
            "GLOBAL_PLATFORM_PLANS",
            "Planes de plataforma",
            "GLOBAL",
            "No hay planes de plataforma activos en esta base cliente.",
            platformClientRemediation,
          ),
  );

  // 11 & 12. Goals y Sports — solo si la vertical GYM está activa en plataforma
  if (gymVerticalCount > 0) {
    try {
      const [goalsCount, sportsCount] = await Promise.all([
        db.goal.count({ where: { status: "active" } }),
        db.sport.count({ where: { status: "active" } }),
      ]);

      checks.push(
        goalsCount >= 1
          ? pass("GLOBAL_GYM_GOALS", "Objetivos (Goals) — vertical GYM", "BLOCKER", "GLOBAL")
          : fail(
              "GLOBAL_GYM_GOALS",
              "Objetivos (Goals) — vertical GYM",
              "BLOCKER",
              "GLOBAL",
              "Vertical GYM activa pero no hay goals activos.",
              "Ejecutar seed con modo 'base' o 'demo' (seedGoals).",
            ),
      );

      checks.push(
        sportsCount >= 1
          ? pass("GLOBAL_GYM_SPORTS", "Deportes (Sports) — vertical GYM", "BLOCKER", "GLOBAL")
          : fail(
              "GLOBAL_GYM_SPORTS",
              "Deportes (Sports) — vertical GYM",
              "BLOCKER",
              "GLOBAL",
              "Vertical GYM activa pero no hay sports activos.",
              "Ejecutar seed con modo 'base' o 'demo' (seedSports).",
            ),
      );
    } catch (err) {
      checks.push(fail(
        "GLOBAL_GYM_GOALS",
        "Goals/Sports — vertical GYM",
        "BLOCKER",
        "GLOBAL",
        `Error al verificar Goals/Sports GYM: ${extractSafeCheckError(err)}`,
        "Verificar que las tablas Goal y Sport existan en la base objetivo.",
      ));
    }
  }

  return checks;
}

// ── Checks por tenant ─────────────────────────────────────────────

async function runTenantChecks(
  tenantId: string,
  activeModuleCodes: string[],
  db: PrismaClient,
): Promise<PreflightCheckItem[]> {
  const checks: PreflightCheckItem[] = [];

  // Cargar datos de tenant en paralelo
  let gym:                 { id: string; name: string; status: string } | null = null;
  let branchCount          = 0;
  let adminUserCount       = 0;
  let taxRateCount         = 0;
  let productCategoryCount = 0;
  let tenantFiscalConfig:  { tenant_id: string } | null = null;
  let cashRegisterCount    = 0;

  try {
    ([
      gym,
      branchCount,
      adminUserCount,
      taxRateCount,
      productCategoryCount,
      tenantFiscalConfig,
      cashRegisterCount,
    ] = await Promise.all([
      db.gym.findUnique({
        where:  { id: tenantId },
        select: { id: true, name: true, status: true },
      }),
      db.branch.count({ where: { gym_id: tenantId, status: "active" } }),
      db.user.count({
        where: {
          gym_id: tenantId,
          role:   { in: ["super_admin", "branch_admin"] },
          status: "active",
        },
      }),
      db.taxRate.count({ where: { tenant_id: tenantId, status: "active" } }),
      db.productCategory.count({ where: { tenant_id: tenantId, status: "active" } }),
      db.tenantFiscalConfig.findUnique({ where: { tenant_id: tenantId } }),
      db.cashRegister.count({ where: { tenant_id: tenantId, is_active: true } }),
    ]));
  } catch (err) {
    checks.push(fail(
      "TENANT_SCHEMA_ERROR",
      "Error al leer datos del tenant",
      "BLOCKER",
      "TENANT",
      extractSafeCheckError(err),
      "Verificar que el schema de la base objetivo incluya las tablas Gym, Branch, User, TaxRate, ProductCategory, TenantFiscalConfig y CashRegister.",
    ));
    return checks;
  }

  // 1. Tenant / Gym existe
  if (!gym) {
    checks.push(
      fail(
        "TENANT_EXISTS",
        "Tenant / Gym existe",
        "BLOCKER",
        "TENANT",
        `No se encontró un Gym con ID '${tenantId}'. El tenant_id puede no corresponder a un gym.`,
        "Verificar que PlatformOrganization.tenant_id coincide con Gym.id.",
      ),
    );
    // Sin gym válido, los demás checks de tenant no tienen sentido
    return checks;
  }

  checks.push(
    gym.status === "active"
      ? pass("TENANT_EXISTS", "Tenant / Gym existe", "BLOCKER", "TENANT")
      : fail(
          "TENANT_EXISTS",
          "Tenant / Gym existe",
          "BLOCKER",
          "TENANT",
          `Gym '${gym.name}' existe pero su estado es '${gym.status}'.`,
          "Activar el gym en la base de datos.",
        ),
  );

  // 2. Location / Branch activa
  checks.push(
    branchCount >= 1
      ? pass("TENANT_LOCATION_EXISTS", "Al menos una location activa", "BLOCKER", "TENANT")
      : fail(
          "TENANT_LOCATION_EXISTS",
          "Al menos una location activa",
          "BLOCKER",
          "TENANT",
          "No hay sucursales activas para este tenant.",
          "Crear al menos una sucursal activa.",
        ),
  );

  // 3. Usuario administrador
  checks.push(
    adminUserCount >= 1
      ? pass("TENANT_ADMIN_USER", "Usuario administrador activo", "BLOCKER", "TENANT")
      : fail(
          "TENANT_ADMIN_USER",
          "Usuario administrador activo",
          "BLOCKER",
          "TENANT",
          "No hay usuarios con rol super_admin o branch_admin activos.",
          "Ejecutar seed base o crear un usuario administrador manualmente.",
        ),
  );

  // 4 & 5. TaxRate y ProductCategory — condicional: commerce.products activo
  const productsActive = activeModuleCodes.includes(PLATFORM_MODULE_CODES.COMMERCE_PRODUCTS);
  if (productsActive) {
    checks.push(
      taxRateCount >= 1
        ? pass("TENANT_TAX_RATE", "Tasas de impuesto activas", "BLOCKER", "MODULE")
        : fail(
            "TENANT_TAX_RATE",
            "Tasas de impuesto activas",
            "BLOCKER",
            "MODULE",
            "commerce.products activo pero no hay tasas de impuesto configuradas.",
            "Ejecutar seed base o crear al menos una tasa (ej: IVA 13%).",
          ),
    );

    checks.push(
      productCategoryCount >= 1
        ? pass("TENANT_PRODUCT_CATEGORY", "Categorías de producto activas", "BLOCKER", "MODULE")
        : fail(
            "TENANT_PRODUCT_CATEGORY",
            "Categorías de producto activas",
            "BLOCKER",
            "MODULE",
            "commerce.products activo pero no hay categorías de producto.",
            "Ejecutar seed base o crear al menos una categoría de producto.",
          ),
    );
  }

  // 6. TenantFiscalConfig
  checks.push(
    tenantFiscalConfig
      ? pass("TENANT_FISCAL_CONFIG", "Configuración fiscal del tenant", "WARNING", "TENANT")
      : warn(
          "TENANT_FISCAL_CONFIG",
          "Configuración fiscal del tenant",
          "TENANT",
          "No existe TenantFiscalConfig para este tenant.",
          "Ejecutar seed base para crear la configuración fiscal por defecto.",
        ),
  );

  // 7. CashRegister — condicional: commerce.cash activo
  const cashActive = activeModuleCodes.includes(PLATFORM_MODULE_CODES.COMMERCE_CASH);
  if (cashActive) {
    checks.push(
      cashRegisterCount >= 1
        ? pass("TENANT_CASH_REGISTER", "Caja registradora activa", "BLOCKER", "MODULE")
        : fail(
            "TENANT_CASH_REGISTER",
            "Caja registradora activa",
            "BLOCKER",
            "MODULE",
            "commerce.cash activo pero no hay cajas registradoras activas.",
            "Crear al menos una caja registradora en el módulo de caja.",
          ),
    );
  }

  // 8, 9, 10, 11. DTE — condicional: fiscal.dte activo
  const dteActive = activeModuleCodes.includes(PLATFORM_MODULE_CODES.FISCAL_DTE);
  if (dteActive) {
    const currentYear = new Date().getFullYear();

    let dteIssuerConfigCount          = 0;
    let dteCorrelativeCount           = 0;
    let dteCredentialsWithoutPayload  = 0;

    try {
      ([
        dteIssuerConfigCount,
        dteCorrelativeCount,
        dteCredentialsWithoutPayload,
      ] = await Promise.all([
        db.dteIssuerConfig.count({ where: { tenant_id: tenantId, is_active: true } }),
        db.dteCorrelative.count({ where: { tenant_id: tenantId, year: currentYear } }),
        db.dteCredential.count({
          where: {
            issuer_config:     { tenant_id: tenantId },
            is_active:         true,
            encrypted_payload: null,
            secret_ref:        null,
          },
        }),
      ]));
    } catch (err) {
      checks.push(fail(
        "TENANT_DTE_SCHEMA_ERROR",
        "Error al leer configuración DTE",
        "BLOCKER",
        "MODULE",
        extractSafeCheckError(err),
        "Verificar que las tablas DteIssuerConfig, DteCorrelative y DteCredential existan en la base objetivo.",
      ));
      return checks;
    }

    checks.push(
      dteIssuerConfigCount >= 1
        ? pass("TENANT_DTE_ISSUER_CONFIG", "Configuración emisor DTE activa", "BLOCKER", "MODULE")
        : fail(
            "TENANT_DTE_ISSUER_CONFIG",
            "Configuración emisor DTE activa",
            "BLOCKER",
            "MODULE",
            "fiscal.dte activo pero no hay DteIssuerConfig activa para este tenant.",
            "Configurar el emisor DTE en /dashboard/dte/config.",
          ),
    );

    checks.push(
      dteCorrelativeCount >= 1
        ? pass(
            "TENANT_DTE_CORRELATIVE",
            `Correlativos DTE para ${currentYear}`,
            "BLOCKER",
            "MODULE",
          )
        : fail(
            "TENANT_DTE_CORRELATIVE",
            `Correlativos DTE para ${currentYear}`,
            "BLOCKER",
            "MODULE",
            `fiscal.dte activo pero no hay DteCorrelative para el año ${currentYear}.`,
            "Inicializar correlativos DTE para el año en curso.",
          ),
    );

    // 10. Clave de cifrado PLATFORM_ENCRYPTION_KEY presente y válida
    const encryptionKeyRaw = process.env.PLATFORM_ENCRYPTION_KEY ?? "";
    const encryptionKeyValid =
      encryptionKeyRaw.trim() !== "" &&
      Buffer.from(encryptionKeyRaw, "base64").byteLength === 32;

    checks.push(
      encryptionKeyValid
        ? pass(
            "TENANT_DTE_ENCRYPTION_KEY",
            "Clave de cifrado de credenciales DTE",
            "WARNING",
            "MODULE",
          )
        : warn(
            "TENANT_DTE_ENCRYPTION_KEY",
            "Clave de cifrado de credenciales DTE",
            "MODULE",
            "PLATFORM_ENCRYPTION_KEY no está configurada o no tiene 32 bytes en base64. " +
              "No es posible cifrar ni descifrar DteCredential.",
            "Generar y configurar PLATFORM_ENCRYPTION_KEY en el entorno. " +
              "Ver .env.example para el comando de generación.",
          ),
    );

    // 11. Credenciales activas sin payload cifrado ni secret_ref
    if (dteCredentialsWithoutPayload > 0) {
      checks.push(
        warn(
          "TENANT_DTE_CREDENTIAL_ENCRYPTION",
          "Cifrado de credenciales DTE",
          "MODULE",
          `${dteCredentialsWithoutPayload} DteCredential(s) activa(s) sin encrypted_payload ni secret_ref.`,
          "Cifrar las credenciales existentes con encryptDteCredentialPayload antes de operar en producción.",
        ),
      );
    }
  }

  return checks;
}

// ── Motor principal ───────────────────────────────────────────────

export async function runDatabasePreflight(
  input: DatabasePreflightInput = {},
  options?: { prismaClient?: PrismaClient },
): Promise<DatabasePreflightResult> {
  const db         = (options?.prismaClient ?? prisma) as PrismaClient;
  // Default CONTROL_PLANE para preservar comportamiento previo sin targetType
  const targetType: DatabasePreflightTargetType = input.targetType ?? "CONTROL_PLANE";

  const checks: PreflightCheckItem[] = [];

  // Siempre: checks globales
  const globalChecks = await runGlobalChecks(db, targetType);
  checks.push(...globalChecks);

  // Si hay tenant: checks de tenant + módulos
  if (input.tenantId) {
    const tenantChecks = await runTenantChecks(
      input.tenantId,
      input.activeModuleCodes ?? [],
      db,
    );
    checks.push(...tenantChecks);
  } else {
    checks.push(
      warn(
        "TENANT_ID_MISSING",
        "Tenant ID no configurado",
        "TENANT",
        "No se proporcionó un tenantId. Los checks de tenant y módulo no se ejecutaron.",
        "Asignar PlatformOrganization.tenant_id a un Gym.id existente.",
      ),
    );
  }

  // Derivar estado final
  const blockerFails = checks.filter((c) => c.severity === "BLOCKER" && c.status === "FAIL");
  const warnings     = checks.filter((c) => c.status === "WARN");
  const passed       = checks.filter((c) => c.status === "PASS");

  let status: DatabasePreflightStatus;
  if (blockerFails.length === 0 && warnings.length === 0) {
    status = "READY";
  } else if (blockerFails.length === 0) {
    status = "PARTIAL";
  } else {
    status = "NOT_READY";
  }

  return {
    status,
    targetType,
    summary: {
      totalChecks: checks.length,
      passed:      passed.length,
      failed:      blockerFails.length,
      warnings:    warnings.length,
    },
    checks,
  };
}
